"""Prüfung eigener Eigenschaften gegen ihre Definition.

Die Datenbank sieht nur JSON. Dass in „Wartungsvertrag bis" ein Datum
steht und in „Serverraum vorhanden" ja oder nein, prüft nur diese Datei —
und zwar beim Schreiben, denn beim Lesen ist es zu spät.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

import asyncpg

ENTITAETEN = ("companies", "contacts", "deals")
ARTEN = (
    "text", "number", "date", "bool", "select", "multiselect",
    # Seit 0035 (Stufe C):
    "textarea", "url", "email", "phone", "currency", "user",
)

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_TELEFON = re.compile(r"^[+0-9][0-9 ()/.\-]{2,40}$")


def schluessel_aus(label: str) -> str:
    """Aus „Wartungsvertrag bis" wird „wartungsvertrag_bis".

    Klein, ASCII, Unterstrich. Der Schlüssel steht danach fest — im JSON
    der Datensätze, und dort soll ihn eine spätere Umbenennung der
    Beschriftung nicht mehr erreichen.
    """
    klein = label.strip().lower()
    klein = klein.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    klein = re.sub(r"[^a-z0-9]+", "_", klein).strip("_")
    return klein or "eigenschaft"


class Ungueltig(ValueError):  # noqa: N818
    """Ein Wert passt nicht zu seiner Definition — mit Nennung des Feldes."""


async def definitionen(conn: asyncpg.Connection, entity: str) -> list[asyncpg.Record]:
    """Die **eigenen** Eigenschaften — die in `custom` stehen.

    Systemeigenschaften stehen seit 0034 in derselben Tabelle, gehören aber
    nicht hierher: Ihr Wert liegt in der Spalte, und die Prüfung von
    `custom` wiese sie sonst als erlaubten Schlüssel aus.
    """
    return await conn.fetch(
        "select id, key, label, kind, options from public.property_definitions "
        "where entity = $1 and is_active and not is_system order by position, label",
        entity,
    )


def pruefen(werte: dict[str, Any], defs: list[asyncpg.Record]) -> dict[str, Any]:
    """Gibt die geprüften Werte zurück oder wirft `Ungueltig`.

    Unbekannte Schlüssel werden abgelehnt, nicht verschluckt: Ein
    Tippfehler im Client landete sonst als stiller Fremdschlüssel im JSON
    und tauchte nirgends mehr auf. `None` löscht den Wert — das ist der
    einzige Weg, eine Eigenschaft wieder leer zu bekommen.
    """
    nach_key = {d["key"]: d for d in defs}
    ergebnis: dict[str, Any] = {}

    for key, wert in werte.items():
        d = nach_key.get(key)
        if d is None:
            raise Ungueltig(f"Unbekannte Eigenschaft „{key}“.")
        if wert is None or wert == "":
            ergebnis[key] = None
            continue

        art = d["kind"]
        label = d["label"]
        try:
            if art == "text":
                ergebnis[key] = str(wert)
            elif art == "number":
                if isinstance(wert, bool):
                    raise ValueError
                ergebnis[key] = float(wert)
            elif art == "date":
                ergebnis[key] = date.fromisoformat(str(wert)).isoformat()
            elif art == "bool":
                if isinstance(wert, bool):
                    ergebnis[key] = wert
                elif str(wert).lower() in ("true", "ja", "1", "yes"):
                    ergebnis[key] = True
                elif str(wert).lower() in ("false", "nein", "0", "no"):
                    ergebnis[key] = False
                else:
                    raise ValueError
            elif art == "select":
                erlaubt = optionswerte(d["options"])
                if str(wert) not in erlaubt:
                    raise Ungueltig(
                        f"„{label}“ erlaubt nur: {', '.join(optionstexte(d['options'])) or 'nichts'}."
                    )
                ergebnis[key] = str(wert)
            elif art == "multiselect":
                ergebnis[key] = _mehrfach(wert, d, label)
            elif art == "textarea":
                ergebnis[key] = str(wert)
            elif art == "url":
                s = str(wert).strip()
                # Nur, was ein Browser gefahrlos öffnet — `javascript:` nie.
                if not re.match(r"^https?://[^\s]+$", s, re.I):
                    raise Ungueltig(f"„{label}“ erwartet eine Adresse mit http:// oder https://.")
                ergebnis[key] = s
            elif art == "email":
                s = str(wert).strip()
                if not _EMAIL.match(s):
                    raise Ungueltig(f"„{label}“ erwartet eine E-Mail-Adresse.")
                ergebnis[key] = s
            elif art == "phone":
                s = str(wert).strip()
                if not _TELEFON.match(s):
                    raise Ungueltig(f"„{label}“ erwartet eine Telefonnummer.")
                ergebnis[key] = s
            elif art == "currency":
                # Ganze Cent. Gerundet wird nie: Ein Betrag mit halbem Cent
                # ist ein Fehler im Aufrufer, kein Wert.
                if isinstance(wert, bool) or not isinstance(wert, int | str):
                    if isinstance(wert, float) and wert.is_integer():
                        wert = int(wert)
                    else:
                        raise ValueError
                cent = int(str(wert))
                if cent < 0:
                    raise Ungueltig(f"„{label}“ darf nicht negativ sein.")
                ergebnis[key] = cent
            elif art == "user":
                # Dass die Person zur Organisation gehört, prüft
                # `pruefen_voll` — hier nur die Form.
                ergebnis[key] = str(UUID(str(wert)))
            else:
                raise Ungueltig(f"„{label}“ hat einen unbekannten Typ.")
        except Ungueltig:
            raise
        except (TypeError, ValueError):
            erwartet = {"number": "eine Zahl", "date": "ein Datum (JJJJ-MM-TT)",
                        "bool": "ja oder nein", "currency": "einen Betrag in ganzen Cent",
                        "user": "eine Person"}.get(art, "einen Text")
            raise Ungueltig(f"„{label}“ erwartet {erwartet}.") from None

    return ergebnis


def _mehrfach(wert: Any, d: Any, label: str) -> list[str] | None:
    """Eine Mehrfachauswahl prüfen: Liste, bekannte Werte, feste Reihenfolge.

    Drei Entscheidungen stecken darin:

    - **Ein einzelner Text wird zur einelementigen Liste.** Ein Import
      oder die Erfassung aus einer Signatur liefert selten schon ein
      Array; das hier abzulehnen wäre Formalismus.
    - **Doppelte fallen weg.** Zweimal „ISO 9001“ ist keine Aussage.
    - **Sortiert wird nach der Definition, nicht nach dem Anklicken.**
      Sonst zeigen zwei Datensätze mit derselben Auswahl verschiedene
      Reihenfolgen, und jeder Vergleich zweier Zeilen wird zur Suche.

    Eine leere Auswahl ist kein leeres Array, sondern `None` — dieselbe
    Bedeutung wie bei jedem anderen Feld, und nur so greift „ist leer“.
    """
    erlaubt = optionswerte(d["options"])
    if isinstance(wert, str):
        roh = [wert]
    elif isinstance(wert, (list, tuple)):
        roh = list(wert)
    else:
        raise Ungueltig(f"„{label}“ erwartet eine Liste von Werten.")

    gewaehlt = {str(w) for w in roh if str(w).strip()}
    unbekannt = sorted(gewaehlt - set(erlaubt))
    if unbekannt:
        raise Ungueltig(
            f"„{label}“ kennt {', '.join(chr(8222) + u + chr(8220) for u in unbekannt)} nicht. "
            f"Erlaubt ist: {', '.join(optionstexte(d['options'])) or 'nichts'}."
        )
    geordnet = [o for o in erlaubt if o in gewaehlt]
    return geordnet or None


def optionen(roh: Any) -> list[dict[str, Any]]:
    """Die Optionsliste in einheitlicher Form: `wert`, `text`, `verborgen`.

    Zwei Formen kommen hier an. Die alte war eine Liste von Texten, in
    der Anzeige und Speicherwert dasselbe waren; die neue trennt beide,
    damit sich eine Beschriftung ändern lässt, ohne die Datensätze zu
    entwerten. 0015 stellt den Bestand um — diese Funktion nimmt trotzdem
    weiter beides an, denn eine Migration, die einmal nicht durchlief,
    soll nicht die Anwendung mitnehmen.

    `verborgen` heißt archiviert: nicht mehr wählbar, aber weiterhin
    gültig. Ein Wert, der an dreihundert Firmen steht, verschwindet nicht
    dadurch, dass ihn niemand mehr vergeben soll.
    """
    import json

    if isinstance(roh, str):
        try:
            roh = json.loads(roh)
        except json.JSONDecodeError:
            return []
    if not isinstance(roh, list):
        return []

    fertig: list[dict[str, Any]] = []
    for o in roh:
        if isinstance(o, dict):
            wert = str(o.get("wert") or "").strip()
            if not wert:
                continue
            fertig.append({
                "wert": wert,
                "text": str(o.get("text") or wert),
                "verborgen": bool(o.get("verborgen")),
            })
        elif str(o).strip():
            fertig.append({"wert": str(o), "text": str(o), "verborgen": False})
    return fertig


def optionswerte(roh: Any, *, auch_verborgene: bool = True) -> list[str]:
    """Nur die Speicherwerte — das, wogegen geprüft wird."""
    return [o["wert"] for o in optionen(roh) if auch_verborgene or not o["verborgen"]]


def optionstexte(roh: Any) -> list[str]:
    """Nur die Beschriftungen — das, was in einer Fehlermeldung steht."""
    return [o["text"] for o in optionen(roh)]


# ── Gruppen und Systemeigenschaften (0034, docs/PLAN-EIGENSCHAFTEN.md) ──

# Die Gruppe, in der eigene Eigenschaften landen, solange niemand sie
# einsortiert hat. Auch neu angelegte kommen hierher, wenn keine Gruppe
# genannt ist.
WEITERE = "weitere"

VORGABEGRUPPEN: dict[str, list[tuple[str, str]]] = {
    "companies": [
        ("firmeninformationen", "Firmeninformationen"),
        ("adresse", "Adresse"),
        ("kontaktwege", "Kontaktwege"),
        ("vertrieb", "Vertrieb"),
        (WEITERE, "Weitere Eigenschaften"),
    ],
    "contacts": [
        ("kontaktinformationen", "Kontaktinformationen"),
        ("kontaktwege", "Kontaktwege"),
        ("vertrieb", "Vertrieb"),
        ("einwilligung", "Einwilligung"),
        (WEITERE, "Weitere Eigenschaften"),
    ],
    "deals": [
        ("geschaeftsinformationen", "Geschäftsinformationen"),
        ("vertrieb", "Vertrieb"),
        (WEITERE, "Weitere Eigenschaften"),
    ],
}


@dataclass(frozen=True)
class Systemfeld:
    """Ein festes Feld, beschrieben wie eine Eigenschaft.

    `art` ist die Art, wie die Oberfläche sie zeigt — sie geht über die
    Arten eigener Eigenschaften hinaus (`person`, `currency`, `url` …),
    weil feste Felder das schon immer waren.

    `bearbeitbar` ist falsch für Gerechnetes (Anzahl Kontakte, Angelegt)
    und für Felder mit eigenem Weg (die Einwilligung ändert sich nur über
    Double-Opt-in und Abmelden, die Firma eines Kontakts über die
    Zuordnung). Sie lassen sich gruppieren, aber nie zur Pflicht machen.
    """

    key: str
    label: str
    art: str
    gruppe: str
    bearbeitbar: bool = True
    optionen: tuple[tuple[str, str], ...] = field(default_factory=tuple)


_STUFEN = (
    ("lead", "Kontakt"), ("qualified", "Qualifiziert"), ("opportunity", "Chance"),
    ("customer", "Kunde"), ("partner", "Partner"), ("disqualified", "Verworfen"),
)
_EINWILLIGUNG = (
    ("keine", "keine"), ("angefragt", "angefragt"), ("bestaetigt", "bestätigt"),
    ("bestandskunde", "Bestandskunde"), ("abgemeldet", "abgemeldet"),
)
_PRODUKTE = (
    ("assistent", "Assistent"), ("analyst", "Analyst"), ("experte", "Experte"),
    ("service", "Service"), ("sonstiges", "Sonstiges"),
)

S = Systemfeld
SYSTEMFELDER: dict[str, list[Systemfeld]] = {
    "companies": [
        S("name", "Firma", "text", "firmeninformationen"),
        S("domain", "Domain", "text", "firmeninformationen"),
        S("industry", "Branche", "text", "firmeninformationen"),
        S("employee_count", "Mitarbeiter", "number", "firmeninformationen"),
        S("description", "Beschreibung", "textarea", "firmeninformationen"),
        S("created_at", "Angelegt", "date", "firmeninformationen", bearbeitbar=False),
        S("updated_at", "Zuletzt geändert", "date", "firmeninformationen", bearbeitbar=False),
        S("street", "Straße", "text", "adresse"),
        S("postal_code", "PLZ", "text", "adresse"),
        S("city", "Ort", "text", "adresse"),
        S("country", "Land", "text", "adresse"),
        S("phone", "Telefon", "phone", "kontaktwege"),
        S("website", "Website", "url", "kontaktwege"),
        S("linkedin_url", "LinkedIn", "url", "kontaktwege"),
        S("lifecycle_stage", "Stufe", "select", "vertrieb", optionen=_STUFEN),
        S("source", "Herkunft", "text", "vertrieb"),
        S("owner_id", "Besitzer", "user", "vertrieb"),
        S("contact_count", "Kontakte", "number", "vertrieb", bearbeitbar=False),
        S("open_deal_count", "Offene Deals", "number", "vertrieb", bearbeitbar=False),
        S("open_amount_cents", "Offener Wert", "currency", "vertrieb", bearbeitbar=False),
    ],
    "contacts": [
        S("first_name", "Vorname", "text", "kontaktinformationen"),
        S("last_name", "Nachname", "text", "kontaktinformationen"),
        S("job_title", "Position", "text", "kontaktinformationen"),
        S("buying_role", "Kaufrolle", "text", "kontaktinformationen"),
        S("company_name", "Firma", "text", "kontaktinformationen", bearbeitbar=False),
        S("created_at", "Angelegt", "date", "kontaktinformationen", bearbeitbar=False),
        S("updated_at", "Zuletzt geändert", "date", "kontaktinformationen", bearbeitbar=False),
        S("email", "E-Mail", "email", "kontaktwege"),
        S("phone", "Telefon", "phone", "kontaktwege"),
        S("mobile", "Mobil", "phone", "kontaktwege"),
        S("linkedin_url", "LinkedIn", "url", "kontaktwege"),
        S("lifecycle_stage", "Stufe", "select", "vertrieb", optionen=_STUFEN),
        S("source", "Herkunft", "text", "vertrieb"),
        S("owner_id", "Besitzer", "user", "vertrieb"),
        S("notes", "Notizen", "textarea", "vertrieb"),
        S("marketing_einwilligung", "Marketing-Einwilligung", "select", "einwilligung",
          bearbeitbar=False, optionen=_EINWILLIGUNG),
    ],
    "deals": [
        S("name", "Name", "text", "geschaeftsinformationen"),
        S("amount_cents", "Betrag", "currency", "geschaeftsinformationen"),
        S("product", "Produkt", "select", "geschaeftsinformationen", optionen=_PRODUKTE),
        S("service_days", "Servicetage", "number", "geschaeftsinformationen"),
        S("close_date", "Abschluss geplant", "date", "geschaeftsinformationen"),
        # Bearbeitet wird die Zuordnung, gezeigt der Name — die Seite reicht
        # die Firmenliste als Auswahl herein.
        S("company_id", "Firma", "company", "geschaeftsinformationen"),
        S("created_at", "Angelegt", "date", "geschaeftsinformationen", bearbeitbar=False),
        S("updated_at", "Zuletzt geändert", "date", "geschaeftsinformationen", bearbeitbar=False),
        S("pipeline_id", "Pipeline", "text", "vertrieb", bearbeitbar=False),
        S("stage_name", "Stufe", "text", "vertrieb", bearbeitbar=False),
        S("probability", "Wahrscheinlichkeit", "number", "vertrieb", bearbeitbar=False),
        S("owner_id", "Besitzer", "user", "vertrieb"),
        S("next_step", "Nächster Schritt", "textarea", "vertrieb"),
        S("lost_reason", "Grund für die Absage", "textarea", "vertrieb"),
    ],
}
del S


def systemfeld(entity: str, key: str) -> Systemfeld | None:
    return next((f for f in SYSTEMFELDER.get(entity, []) if f.key == key), None)


async def vorgaben_sicherstellen(conn: asyncpg.Connection, org_id: UUID, entity: str) -> None:
    """Legt fehlende Vorgabegruppen und Systemeigenschaften an.

    Wiederholbar und nebenläufig sicher: Alles läuft über `on conflict do
    nothing` auf den eindeutigen Schlüsseln. Zwei gleichzeitige erste
    Aufrufe legen also nichts doppelt an. Kommt mit einer neuen Version ein
    festes Feld dazu, erscheint es hier von selbst — am Ende seiner
    Vorgabegruppe.

    Eigene Eigenschaften ohne Gruppe (alle aus der Zeit vor 0034) kommen in
    „Weitere Eigenschaften". Umsortiert wird nichts, was schon eine Gruppe
    hat — die Einrichtung eines Menschen gilt.
    """
    for pos, (key, label) in enumerate(VORGABEGRUPPEN[entity]):
        await conn.execute(
            "insert into public.property_groups (org_id, entity, key, label, position, is_system) "
            "values ($1, $2, $3, $4, $5, true) on conflict (org_id, entity, key) do nothing",
            org_id, entity, key, label, pos * 10,
        )
    gruppen = {
        z["key"]: z["id"] for z in await conn.fetch(
            "select id, key from public.property_groups where org_id = $1 and entity = $2",
            org_id, entity,
        )
    }
    # Neue Felder hinten anstellen: Die Stelle ist die höchste bisherige
    # Position in der Gruppe plus Abstand, damit ein später hinzugekommenes
    # Feld eine Anordnung nicht durcheinanderbringt.
    hoechste = {
        z["group_id"]: z["pos"] for z in await conn.fetch(
            "select group_id, max(position) as pos from public.property_definitions "
            "where org_id = $1 and entity = $2 group by group_id",
            org_id, entity,
        )
    }
    for i, f in enumerate(SYSTEMFELDER[entity]):
        gid = gruppen.get(f.gruppe) or gruppen[WEITERE]
        await conn.execute(
            """
            insert into public.property_definitions
              (org_id, entity, key, label, kind, group_id, is_system, position)
            values ($1, $2, $3, $4, 'text', $5, true, $6)
            on conflict (org_id, entity, key) do nothing
            """,
            org_id, entity, f.key, f.label, gid, (hoechste.get(gid) or 0) + (i + 1) * 10,
        )
    await conn.execute(
        "update public.property_definitions set group_id = $3 "
        "where org_id = $1 and entity = $2 and group_id is null",
        org_id, entity, gruppen[WEITERE],
    )


async def pruefen_voll(conn: asyncpg.Connection, entity: str, werte: dict[str, Any]) -> dict[str, Any]:
    """`pruefen` plus das, wofür es die Datenbank braucht: Eine Person muss
    zur Organisation gehören.

    Ausdrücklich über `current_user_orgs()` eingegrenzt: `user_org_roles`
    steht nicht unter FORCE (die Anmeldung liest sie ohne Nutzerkontext),
    und als Tabelleneigentümer sähe die Verbindung sonst jede Organisation
    der Box. Der Test dafür hat genau das gezeigt.
    """
    defs = await definitionen(conn, entity)
    geprueft = pruefen(werte, defs)
    personen = [d for d in defs if d["kind"] == "user" and geprueft.get(d["key"])]
    if personen:
        bekannt = {
            str(z["user_id"]) for z in await conn.fetch(
                "select user_id from public.user_org_roles "
                "where org_id in (select public.current_user_orgs())"
            )
        }
        for d in personen:
            if geprueft[d["key"]] not in bekannt:
                raise Ungueltig(f"„{d['label']}“: Diese Person gehört nicht zu Ihrer Organisation.")
    return geprueft


async def pflicht_pruefen(
    conn: asyncpg.Connection, entity: str, daten: dict[str, Any], *, neu: bool
) -> None:
    """Pflichtfelder — beim Anlegen gefüllt, beim Ändern nicht geleert.

    Beim Ändern zählt nur, was die Anfrage anfasst: Ein alter Datensatz, dem
    ein Pflichtwert fehlt, lässt sich weiter bearbeiten. Rückwirkend
    gesperrt wird nichts; die Datensatzseite markiert, was fehlt.

    Nur für Menschen an der Oberfläche und die API. Einfuhr, Anreicherung
    und KI legen über eigene Wege an und sind ausgenommen — sonst scheiterte
    jede Messeliste an einem Feld, das auf ihr nicht steht.
    """
    zeilen = await conn.fetch(
        "select d.key, d.label, d.is_system, coalesce(g.vertraulich, false) as vertraulich "
        "from public.property_definitions d "
        "left join public.property_groups g on g.id = d.group_id "
        "where d.entity = $1 and d.required and d.is_active",
        entity,
    )
    # Ein vertrauliches Pflichtfeld kann nur füllen, wer es sehen darf. Für
    # alle anderen ist es kein Pflichtfeld — sonst könnte ein Trainer keinen
    # Spieler anlegen, weil die Bankverbindung fehlt (seit 26.10.18).
    if any(z["vertraulich"] for z in zeilen) and not await conn.fetchval(
        "select public.sieht_vertrauliches()"
    ):
        zeilen = [z for z in zeilen if not z["vertraulich"]]
    custom = daten.get("custom") or {}
    fehlend: list[str] = []
    for z in zeilen:
        quelle = daten if z["is_system"] else custom
        if neu:
            if _leer(quelle.get(z["key"])):
                fehlend.append(z["label"])
        elif z["key"] in quelle and _leer(quelle[z["key"]]):
            fehlend.append(z["label"])
    if fehlend:
        namen = ", ".join(f"„{n}“" for n in fehlend)
        raise Ungueltig(
            f"Pflichtfeld {namen} fehlt." if len(fehlend) == 1 else f"Pflichtfelder {namen} fehlen."
        )


def _leer(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not v)


# Feste Felder, die nie Pflicht werden können, obwohl man sie bearbeiten
# kann: Der Absagegrund entsteht beim Verlieren, nicht beim Anlegen.
NIE_PFLICHT = {("deals", "lost_reason")}


async def pflicht_oder_422(
    conn: asyncpg.Connection, entity: str, daten: dict[str, Any], *, neu: bool
) -> None:
    """`pflicht_pruefen` für die Routen: 422 mit dem Satz für Menschen."""
    from fastapi import HTTPException

    try:
        await pflicht_pruefen(conn, entity, daten, neu=neu)
    except Ungueltig as exc:
        raise HTTPException(422, str(exc)) from exc
