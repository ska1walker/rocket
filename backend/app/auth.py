"""Identität aus dem Olares-Header — wir bauen keine eigene Anmeldung.

Der Envoy-Sidecar vor dem Pod hat den Authelia-Token bereits geprüft, wenn
ein Request hier ankommt. Was bleibt, ist die Zuordnung des Olares-Namens
auf unsere interne Kennung.
"""

import re
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app import anmeldung as anmeldung_kern
from app import api_schluessel, sicherung
from app.config import settings
from app.db import acquire, acquire_as

# Die Stufen, mit denen ein Vertrieb anfängt. Sie stehen hier und nicht in
# einer Migration, weil Organisationen zur Laufzeit entstehen — eine
# Migration läuft genau einmal und hätte für die zweite Organisation nichts
# angelegt. Wer die Stufen ändert, ändert sie danach in der Oberfläche.
# Der Produktkatalog aus claude/Produkte.md. Preise netto in Cent.
#
# Der Servicetag steht ohne Preis: In der Produktbeschreibung ist keiner
# genannt, und ein geratener Tagessatz landete sonst in einem Angebot beim
# Kunden. Wer ihn einträgt, trägt ihn im Katalog ein.
STANDARD_PRODUKTE: list[dict[str, object]] = [
    {
        "key": "assistent",
        "name": "Assistent",
        "description": "Ein Werkzeug. Bis 5 gleichzeitige Nutzer, 500 Dokumente, Open WebUI.",
        "kind": "system",
        "list_price_cents": 990000,
        "default_service_days": 6,
    },
    {
        "key": "analyst",
        "name": "Analyst",
        "description": "Ein Kollege. Eine Sitzung, 2.500 Dokumente, Zugriff auf Dokumente und Netz.",
        "kind": "system",
        "list_price_cents": 1450000,
        "default_service_days": 8,
    },
    {
        "key": "experte",
        "name": "Experte",
        "description": "Ein Prozess. Läuft selbstständig, Zugriff auf Anwendungen, Datenbanken, Verzeichnisse.",
        "kind": "system",
        "list_price_cents": 1450000,
        "default_service_days": 12,
    },
    {
        "key": "servicetag",
        "name": "Zusätzlicher Servicetag",
        "description": "Einführung, Anpassung, Schulung — über die enthaltenen Tage hinaus.",
        "kind": "service",
        "list_price_cents": 0,
        "default_service_days": None,
    },
]

# Die Gründe, aus denen ein Geschäft bei AImighty verloren geht. Sie
# stehen hier als Startpunkt, nicht als Wahrheit — der Vertrieb ergänzt
# sie, sobald er einen neuen kennenlernt.
STANDARD_VERLUSTGRUENDE: list[str] = [
    "Preis",
    "Kein Budget",
    "Zeitpunkt passt nicht",
    "Widerstand aus der IT",
    "Cloud-Lösung gewählt",
    "Kein Bedarf erkannt",
    "Entscheider nicht erreicht",
    "Projekt verschoben",
    "Kontakt abgebrochen",
]

STANDARD_STUFEN: list[tuple[str, str, float]] = [
    ("Erstkontakt", "open", 0.05),
    ("Qualifiziert", "open", 0.20),
    ("Vorführung", "open", 0.40),
    ("Angebot", "open", 0.60),
    ("Verhandlung", "open", 0.80),
    ("Gewonnen", "won", 1.00),
    ("Verloren", "lost", 0.00),
]


class CurrentUser(BaseModel):
    """Wer handelt — und über welchen Zugang.

    Bei einem geteilten Olares-Konto sind das zwei verschiedene Dinge:
    `user_id` ist die Person, der die Arbeit zugeschrieben wird,
    `login_username` der Zugang, über den sie hereinkam. Das Protokoll
    hält beides fest, sonst sähe es aus, als hätte die Person sich selbst
    angemeldet.
    """

    olares_username: str
    user_id: UUID
    org_id: UUID
    display_name: str | None = None
    # Der Name des Zugangs, über den die Anfrage kam — fürs Protokoll.
    login_username: str = ""
    # Die Organisation verlangt einen zweiten Faktor, und diese Person hat
    # noch keinen. Dann ist nur die Einrichtung erlaubt (siehe unten).
    zweiter_faktor_fehlt: bool = False
    # Rolle und Sicht in der Organisation der Sitzung, gelesen beim
    # Anmelden der Anfrage (seit 26.10.15/16). `verwaltet` liest die Rolle
    # trotzdem frisch — dort entscheidet sie über die größte Sprengkraft.
    rolle: str | None = None
    sicht: str = "alles"

    @property
    def handelnder(self) -> UUID:
        """Wer handelt. Seit der Sitzplatz-Wechsel weg ist (26.9.2), ist
        das immer die angemeldete Person selbst."""
        return self.user_id


async def _seed_pipeline(conn: asyncpg.Connection, org_id: UUID) -> None:
    pipeline_id = await conn.fetchval(
        """
        insert into public.pipelines (org_id, name, is_default, position)
        values ($1, 'Vertrieb', true, 0)
        returning id
        """,
        org_id,
    )
    for position, (name, kind, probability) in enumerate(STANDARD_STUFEN):
        await conn.execute(
            """
            insert into public.pipeline_stages
              (org_id, pipeline_id, name, kind, probability, position)
            values ($1, $2, $3, $4::public.stage_kind, $5, $6)
            """,
            org_id,
            pipeline_id,
            name,
            kind,
            probability,
            position,
        )


# Die vier Stufen, die HubSpot vorgibt und die sich bewährt haben. Die
# Art dahinter entscheidet, ob die Uhr läuft: „wartet auf Kontakt" ist
# die einzige offene Stufe, in der die Frist pausiert.
STANDARD_TICKETSTUFEN = [
    ("Neu", "neu"),
    ("Warten auf Kontakt", "wartet_auf_kontakt"),
    ("Wartet auf uns", "offen"),
    ("Abgeschlossen", "abgeschlossen"),
]

STANDARD_TICKETKATEGORIEN = [
    "Allgemeine Anfrage",
    "Störung",
    "Rechnung",
    "Einrichtung",
    "Erweiterung",
]


async def _seed_ticketpipeline(conn: asyncpg.Connection, org_id: UUID) -> None:
    pipeline_id = await conn.fetchval(
        """
        insert into public.ticket_pipelines (org_id, name, is_default, position)
        values ($1, 'Anliegen', true, 0)
        returning id
        """,
        org_id,
    )
    for position, (name, art) in enumerate(STANDARD_TICKETSTUFEN):
        await conn.execute(
            """
            insert into public.ticket_stages (org_id, pipeline_id, name, art, position)
            values ($1, $2, $3, $4::public.ticket_stufenart, $5)
            """,
            org_id, pipeline_id, name, art, position,
        )
    for position, name in enumerate(STANDARD_TICKETKATEGORIEN):
        await conn.execute(
            "insert into public.ticket_kategorien (org_id, name, position) values ($1,$2,$3) "
            "on conflict do nothing",
            org_id, name, position,
        )


async def _ticketpipelines_bereinigen(conn: asyncpg.Connection, org_id: UUID) -> int:
    """Räumt doppelte Standard-Pipelines weg — die älteste bleibt.

    Bis 0.3.1 prüfte der Start ohne Nutzerkontext, ob eine Ticket-Pipeline
    da ist; unter Zeilensicherheit sah er nie eine und säte bei jedem
    Start eine neue „Anliegen“. Weggeräumt wird nur, was kein Ticket
    trägt: Eine Pipeline mit Tickets ist eine Entscheidung, keine Dublette.
    """
    return await conn.fetchval(
        """
        with behalten as (
            select id from public.ticket_pipelines
             where org_id = $1 and deleted_at is null
             order by created_at, id limit 1
        ), weg as (
            update public.ticket_pipelines p
               set deleted_at = now()
             where p.org_id = $1 and p.deleted_at is null
               and p.id <> (select id from behalten)
               and p.name = (select name from public.ticket_pipelines where id = (select id from behalten))
               and not exists (select 1 from public.tickets t where t.pipeline_id = p.id and t.deleted_at is null)
            returning 1
        )
        select count(*) from weg
        """,
        org_id,
    )


async def _seed_verlustgruende(conn: asyncpg.Connection, org_id: UUID) -> None:
    for position, grund in enumerate(STANDARD_VERLUSTGRUENDE):
        await conn.execute(
            "insert into public.loss_reasons (org_id, name, position) values ($1,$2,$3) "
            "on conflict (org_id, name) do nothing",
            org_id,
            grund,
            position,
        )


async def _seed_produkte(conn: asyncpg.Connection, org_id: UUID) -> None:
    for position, produkt in enumerate(STANDARD_PRODUKTE):
        await conn.execute(
            """
            insert into public.products
              (org_id, key, name, description, kind, list_price_cents,
               default_service_days, position)
            values ($1,$2,$3,$4,$5::public.product_kind,$6,$7,$8)
            on conflict (org_id, key) do nothing
            """,
            org_id,
            produkt["key"],
            produkt["name"],
            produkt["description"],
            produkt["kind"],
            produkt["list_price_cents"],
            produkt["default_service_days"],
            position,
        )


async def _einrichten(conn: asyncpg.Connection, org_id: UUID, user_id: UUID) -> None:
    """Eine frisch angelegte Organisation füllen.

    Der Normalfall ist die leere Pipeline. Der andere Fall ist der teure:
    Nach einer Deinstallation legt Olares die Datenbank neu an, samt neuer
    Org-Kennung — der gesamte Vertrieb wäre weg. Liegt neben den Daten ein
    Abzug, wird er stattdessen zurückgespielt. Er überlebt, weil
    /app/data unter permission.appData steht und die Datenbank nicht.

    Zurückgespielt wird aber **nur in die erste Organisation der Box**.
    Ohne diese Bedingung bekäme der zweite Mensch, der sich anmeldet, den
    Bestand des ersten in seine eigene Organisation gelegt — ein Leck
    zwischen Mandanten, und zwar eines, das wie eine Rettung aussieht.
    Eine zweite Organisation ist kein Wiederanlauf, sondern ein zweiter
    Nutzer, und der fängt leer an.
    """
    orgs = await conn.fetchval("select count(*) from public.orgs where deleted_at is null")
    erster_anlauf = orgs == 1

    letzter = next(iter(sicherung.staende()), None) if erster_anlauf else None
    if letzter is not None:
        try:
            daten = sicherung.abzug_lesen(letzter["name"])
            await sicherung.zurueckspielen(conn, daten, org_id, user_id, frisch=True)
        except Exception as exc:
            # Ein kaputter Abzug darf die Anmeldung nicht verhindern. Dann
            # gibt es eben eine leere Pipeline, und der Stand liegt weiter
            # da — von Hand einlesbar.
            print(f"Sicherung {letzter['name']} nicht lesbar: {exc}", flush=True)

    vorhanden = await conn.fetchval(
        "select count(*) from public.pipelines where org_id = $1 and deleted_at is null", org_id
    )
    if not vorhanden:
        await _seed_pipeline(conn, org_id)

    katalog = await conn.fetchval(
        "select count(*) from public.products where org_id = $1", org_id
    )
    if not katalog:
        await _seed_produkte(conn, org_id)

    gruende = await conn.fetchval(
        "select count(*) from public.loss_reasons where org_id = $1", org_id
    )
    if not gruende:
        await _seed_verlustgruende(conn, org_id)
        await _seed_ticketpipeline(conn, org_id)


async def _ensure_user_and_org(olares_username: str) -> CurrentUser:
    """Nutzer und Organisation anlegen, falls es sie noch nicht gibt.

    Auf der Box legt das Onboarding beides an. Lokal — und beim ersten
    Aufruf einer neuen Kennung — passiert es hier, damit der erste Request
    nicht ins Leere läuft.
    """
    async with acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                insert into public.users (olares_username, display_name)
                values ($1, $1)
                on conflict (olares_username) do update set last_seen_at = now()
                returning id, display_name
                """,
                olares_username,
            )
            user_id: UUID = row["id"]

            org = await conn.fetchrow(
                """
                select o.id
                from public.orgs o
                join public.user_org_roles r on r.org_id = o.id
                where r.user_id = $1 and o.deleted_at is null
                limit 1
                """,
                user_id,
            )

            neu_angelegt = org is None
            if org is None:
                org = await conn.fetchrow(
                    """
                    insert into public.orgs (name, slug)
                    values ($1, $2)
                    returning id
                    """,
                    f"Organisation {olares_username}",
                    f"org-{olares_username}",
                )
                await conn.execute(
                    """
                    insert into public.user_org_roles (user_id, org_id, role)
                    values ($1, $2, 'owner')
                    on conflict (user_id, org_id) do nothing
                    """,
                    user_id,
                    org["id"],
                )

    # Einstellungen, Bestand und Pipeline entstehen erst hier — mit
    # gesetztem Nutzerkontext. Die Tabellen stehen unter FORCE ROW LEVEL
    # SECURITY; ohne Kontext würde die Zeilensicherheit die Anlage
    # abweisen. Der Block oben kann ihn noch nicht setzen: Die Rolle, aus
    # der er sich ableitet, entsteht dort ja gerade erst.
    if neu_angelegt:
        async with acquire_as(user_id) as conn:
            await conn.execute(
                "insert into public.org_settings (org_id) values ($1) on conflict do nothing",
                org["id"],
            )
            await _einrichten(conn, org["id"], user_id)

    async with acquire() as conn:
        stand = await conn.fetchrow(
            "select role::text as rolle, sicht from public.user_org_roles where user_id = $1 and org_id = $2",
            user_id, org["id"],
        )
    return CurrentUser(
        olares_username=olares_username,
        user_id=user_id,
        org_id=org["id"],
        display_name=row["display_name"],
        rolle=stand["rolle"] if stand else None,
        sicht=stand["sicht"] if stand else "alles",
    )


async def _aus_schluessel(token: str) -> tuple[CurrentUser, tuple[str, ...]] | None:
    """Wer steckt hinter diesem API-Schlüssel — und wohin darf er?

    Der Schlüssel handelt als die Person, die ihn erzeugt hat. Ist sie
    gelöscht oder kein Mitglied der Organisation mehr, gilt er nicht.
    Im Protokoll steht als Zugang `api:<Name des Schlüssels>`, damit man
    später sieht, dass ein Programm gehandelt hat und welches.
    """
    async with acquire() as conn:
        schluessel = await api_schluessel.pruefen(conn, token)
        if schluessel is None:
            return None
        person = await conn.fetchrow(
            "select id, olares_username, display_name from public.users "
            "where id = $1 and deleted_at is null",
            schluessel.user_id,
        )
    if person is None:
        return None
    async with acquire_as(schluessel.user_id) as conn:
        mitglied = await conn.fetchrow(
            "select role::text as rolle, sicht from public.user_org_roles where user_id = $1 and org_id = $2",
            schluessel.user_id, schluessel.org_id,
        )
    if mitglied is None:
        return None
    return (
        CurrentUser(
            olares_username=person["olares_username"],
            user_id=person["id"],
            org_id=schluessel.org_id,
            display_name=person["display_name"],
            login_username=f"api:{schluessel.name}",
            rolle=mitglied["rolle"],
            sicht=mitglied["sicht"],
        ),
        schluessel.bereiche,
    )


async def _aus_sitzung(keks: str) -> CurrentUser | None:
    """Wer steckt hinter diesem Sitzungskeks? Nichts, wenn er nicht (mehr) gilt."""
    async with acquire() as conn:
        sitzung = await anmeldung_kern.sitzung_lesen(conn, keks)
        if sitzung is None:
            return None
        person = await conn.fetchrow(
            "select id, olares_username, display_name, totp_seit is null as ohne_faktor "
            "from public.users where id = $1 and deleted_at is null",
            sitzung.user_id,
        )
    if person is None:
        return None
    async with acquire_as(sitzung.user_id) as conn:
        # Noch Mitglied der Organisation, für die die Sitzung gilt? Wer
        # entfernt wurde, sähe unter der Zeilensicherheit ohnehin nichts
        # mehr — aber er soll auch nicht mehr als angemeldet gelten.
        stand = await conn.fetchrow(
            "select coalesce(s.zweiter_faktor_pflicht, false) as pflicht, "
            "       r.role::text as rolle, r.sicht "
            "from public.user_org_roles r "
            "left join public.org_settings s on s.org_id = r.org_id "
            "where r.user_id = $1 and r.org_id = $2",
            sitzung.user_id,
            sitzung.org_id,
        )
    if stand is None:
        return None
    # Die Pflicht zählt nur für den, der keinen Faktor hat. Gelesen mit
    # Nutzerkontext: `org_settings` steht unter FORCE, ohne Kontext läse man
    # hier immer „nein" (so war es im ersten Entwurf).
    faktor_fehlt = bool(person["ohne_faktor"] and stand["pflicht"])
    return CurrentUser(
        olares_username=person["olares_username"],
        user_id=person["id"],
        org_id=sitzung.org_id,
        display_name=person["display_name"],
        login_username=person["olares_username"],
        zweiter_faktor_fehlt=faktor_fehlt,
        rolle=stand["rolle"],
        sicht=stand["sicht"],
    )


# Sobald einmal ein Passwort existierte, muss nie wieder gefragt werden:
# Der Weg führt nur in eine Richtung. Ein Neustart setzt den Merker zurück
# und fragt einmal nach — das kostet eine Abfrage, keine Sicherheit.
_bewohnt = False


async def noch_unbewohnt() -> bool:
    """Hat in dieser Datenbank noch **niemand** ein Passwort?

    Das ist die Bedingung der Erstinstallation. Sie ist bewusst nicht „gibt
    es Nutzer?": Der Kopf legt beim ersten Aufruf ja selbst einen an, und
    danach stünde die Tür wieder zu, bevor jemand ein Passwort setzen
    konnte. Erst das erste Passwort schließt sie — endgültig.
    """
    global _bewohnt
    if _bewohnt:
        return False
    async with acquire() as conn:
        vorhanden = await conn.fetchval(
            "select exists(select 1 from public.users where passwort_hash is not null)"
        )
    _bewohnt = bool(vorhanden)
    return not _bewohnt


async def eigentuemerin_ohne_passwort() -> tuple[UUID, UUID, str] | None:
    """Die erste Eigentümerin der Box, wenn sie noch kein Passwort hat.

    Das ist eine Box, die vor 26.10.1 über den Olares-Kopf eingerichtet
    wurde: Bestand ist da, ein Passwort nicht. Die Einrichtung gibt dann
    genau ihr das Passwort, statt eine zweite Organisation anzulegen.
    """
    async with acquire() as conn:
        zeile = await conn.fetchrow(
            """
            select u.id, r.org_id, u.olares_username
              from public.users u
              join public.user_org_roles r on r.user_id = u.id
              join public.orgs o on o.id = r.org_id
             where r.role = 'owner' and u.deleted_at is null and o.deleted_at is null
               and u.passwort_hash is null
             order by o.created_at, r.joined_at
             limit 1
            """
        )
    return (zeile["id"], zeile["org_id"], zeile["olares_username"]) if zeile else None


def bewohnt_merken() -> None:
    """Nach dem ersten Passwort: nie wieder in der Datenbank nachsehen."""
    global _bewohnt
    _bewohnt = True


# Was eine Person tun darf, die den verlangten zweiten Faktor noch nicht
# hat: ihn einrichten, sehen, wer sie ist, sich abmelden. Alles andere
# wartet, bis der Faktor steht — sonst wäre die Pflicht ein Hinweis und
# keine Pflicht.
OHNE_FAKTOR_ERLAUBT = (
    "/api/anmeldung/zweiter-faktor",
    "/api/anmeldung/lage",
    "/api/abmeldung",
    "/api/mitglieder/wer",
)


# Was eine Person mit der Rolle `viewer` schreibend aufrufen darf: sich
# anmelden und abmelden, die eigenen Einstellungen und Ansichten, und was
# nur liest, obwohl es ein POST ist (eine Frage an den Bestand, ein Auftrag
# an den Assistenten — der schlägt nur vor, ausgeführt wird über die
# schreibenden Wege, und die bleiben zu).
NUR_LESEND_ERLAUBT = (
    "/api/anmeldung",
    "/api/abmeldung",
    "/api/mitglieder/wer",
    "/api/ansichten",
    "/api/fragen",
    "/api/assistent",
    "/api/briefing/text",
    "/api/fehler",
)

LESEND = frozenset({"GET", "HEAD", "OPTIONS"})

# Was eine Person mit eingeschränkter Sicht aufrufen darf (seit 26.10.16).
# Die Zeilensicherheit schützt die Daten schon allein; diese Liste ist die
# zweite Tür davor: Ein neuer Weg ist für Eingeschränkte zu, bis er hier
# steht — und wer ihn einträgt, denkt dabei an sie. Je Eintrag: Pfad als
# Muster, dazu die Methoden (`None` = alle).
EINGESCHRAENKT_ERLAUBT: tuple[tuple[re.Pattern[str], frozenset[str] | None], ...] = tuple(
    (re.compile(muster), frozenset(methoden) if methoden else None)
    for muster, methoden in (
        # Anmelden, Abmelden, wer man ist, eigene Einstellungen und Sicht.
        (r"^/api/(anmeldung|abmeldung|einladung)(/|$)", None),
        (r"^/api/mitglieder(/wer(/.*)?)?$", None),
        (r"^/api/mitglieder/[^/]+/sicht$", {"GET"}),
        (r"^/api/fehler$", None),
        (r"^/api/settings$", {"GET"}),
        # Der Bestand — was davon sichtbar ist, entscheidet die Datenbank.
        # Anreichern nicht: Es schreibt einen Lauf, den nur sieht, wer alles
        # sieht, und fragt Dienste außerhalb an.
        (r"^/api/companies(/(?!.*/anreichern$)(?!.*/bereich$).*)?$", None),
        (r"^/api/contacts(/(?!.*/anreichern$).*)?$", None),
        (r"^/api/(activities|tasks|dokumente|ansichten|listen|kampagnen|vorlagen)(/.*)?$", None),
        (r"^/api/suche$", {"GET"}),
        (r"^/api/ausfuhr(/.*)?$", {"GET"}),
        (r"^/api/(eigenschaften|bereiche)(/.*)?$", {"GET"}),
        # AI über das Sichtbare: Fragen, Assistent, Anschreiben.
        (r"^/api/(fragen|assistent)$", None),
        (r"^/api/ki/entwurf$", None),
        # Ob ein Sprachmodell und ein Postweg eingerichtet sind — nur ja/nein,
        # die Oberfläche sagt damit vorher, was nicht geht.
        (r"^/api/(ki|post)/status$", {"GET"}),
        # Das eigene Postfach (seit 26.10.20): Es gehört der Person, nicht
        # dem Bestand, und ordnet nur Kontakten zu, die sie ohnehin sieht.
        (r"^/api/mailkonto(/.*)?$", None),
    )
)


def eingeschraenkt_erlaubt(methode: str, pfad: str) -> bool:
    for muster, methoden in EINGESCHRAENKT_ERLAUBT:
        if muster.match(pfad) and (methoden is None or methode in methoden):
            return True
    return False


async def get_current_user(
    request: Request,
    x_bfl_user: str | None = Header(None, alias="X-Bfl-User"),
) -> CurrentUser:
    """Wer handelt — aus der eigenen Sitzung, sonst aus dem Olares-Kopf.

    Die Reihenfolge ist die Sicherheit: Ein gültiger Sitzungskeks gewinnt
    immer. Der Kopf `X-Bfl-User` gilt **nur** im Modus `olares`, in dem der
    Envoy-Sidecar davorsteht und ihn setzt. Im Modus `eigen` ist der Kopf
    wertlos — sonst genügte `curl -H 'X-Bfl-User: kaivostudio'`, um bei
    offenem Entrance der Eigentümer zu sein.

    Bis 26.10.1 gab es eine Ausnahme: Solange **niemand** ein Passwort
    hatte, zählte der Kopf auch im Modus `eigen` — damit eine frische
    Installation keine Sackgasse ist. Bei offenem Entrance war das ein
    offenes Tor, und der Name des Eigentümers steht in der Adresse der
    Box. Die Erstinstallation läuft seitdem über einen Code aus dem
    Datenordner (`app/einrichtung.py`, `POST /api/anmeldung/einrichten`);
    im Modus `eigen` gilt der Kopf **nie**.

    Den Wechsel auf eine andere Person per Kopf `X-Rocket-Sitzplatz` gibt
    es seit 26.9.2 nicht mehr: Er stammte aus der Zeit eines geteilten
    Olares-Zugangs, und mit eigener Anmeldung ist jeder bereits er selbst.

    API-Schlüssel (`Authorization: Bearer rk_…`, seit 26.10.14) gelten nur
    ohne gültigen Keks und nur für die Pfade ihrer Bereiche. Den zweiten
    Faktor verlangen sie nicht: Erzeugt wurde der Schlüssel in einer
    Sitzung, die ihn hatte, und er ist selbst das Geheimnis — ein Programm
    kann keinen Code aus der Authenticator-App abtippen.
    """
    angemeldet: CurrentUser | None = None

    keks = request.cookies.get(anmeldung_kern.KEKS)
    if keks:
        angemeldet = await _aus_sitzung(keks)

    if angemeldet is None:
        kopf = request.headers.get("authorization", "")
        art, _, token = kopf.partition(" ")
        if art.lower() == "bearer" and token.strip():
            gefunden = await _aus_schluessel(token.strip())
            if gefunden is None:
                raise HTTPException(
                    status_code=401,
                    detail="Dieser API-Schlüssel gilt nicht (unbekannt, widerrufen oder abgelaufen).",
                )
            angemeldet, bereiche = gefunden
            if not api_schluessel.erlaubt(bereiche, request.url.path):
                raise HTTPException(
                    status_code=403,
                    detail=f"Dieser API-Schlüssel gilt nicht für {request.url.path}.",
                )
            await _nur_lesend_pruefen(request, angemeldet)
            _eingeschraenkt_pruefen(request, angemeldet)
            return angemeldet

    if angemeldet is None and settings.anmeldung_modus != "eigen":
        name = (x_bfl_user or "").strip() or settings.dev_user.strip()
        if name:
            angemeldet = await _ensure_user_and_org(name)
            angemeldet = angemeldet.model_copy(update={"login_username": name})

    if angemeldet is None:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")

    if angemeldet.zweiter_faktor_fehlt and not request.url.path.startswith(OHNE_FAKTOR_ERLAUBT):
        # Der Kopf ist das Signal für die Oberfläche, zur Einrichtung zu
        # führen — an der Meldung dürfte sie das nicht festmachen.
        raise HTTPException(
            status_code=403,
            detail="Ihre Organisation verlangt einen zweiten Faktor. Richten Sie ihn zuerst ein.",
            headers={"X-Rocket-Zweiter-Faktor": "einrichten"},
        )

    await _nur_lesend_pruefen(request, angemeldet)
    _eingeschraenkt_pruefen(request, angemeldet)
    return angemeldet


def _eingeschraenkt_pruefen(request: Request, user: CurrentUser) -> None:
    """Eingeschränkte Sicht: nur die Wege aus `EINGESCHRAENKT_ERLAUBT`.

    Die Meldung sagt, warum, nicht was dahinter liegt. Die Sicht steht auch
    am Request — der Fehlerweg für Dubletten (main.doppelter_eintrag) nennt
    Eingeschränkten keinen Grund, der etwas über Verborgenes verriete.
    """
    request.state.sicht = user.sicht
    if user.sicht != "eingeschraenkt":
        return
    if request.method in ("HEAD", "OPTIONS"):
        return
    if not eingeschraenkt_erlaubt(request.method, request.url.path):
        raise HTTPException(
            status_code=403,
            detail="Mit eingeschränkter Sicht steht Ihnen das nicht offen. Fragen Sie die Leitung.",
        )


async def _nur_lesend_pruefen(request: Request, user: CurrentUser) -> None:
    """`viewer` liest nur (seit 26.10.15).

    Bis dahin hatte die Rolle keine Wirkung: Ein `viewer` konnte alles, was
    ein `member` kann. Geprüft wird an dieser einen Stelle vor jedem
    Router, nicht an jedem Endpunkt — ein neuer schreibender Weg ist damit
    von selbst zu. Nur lesende Aufrufe kosten keine Abfrage.
    """
    if request.method in LESEND or request.url.path.startswith(NUR_LESEND_ERLAUBT):
        return
    if user.rolle == "viewer":
        raise HTTPException(
            status_code=403,
            detail="Sie haben Lesezugriff. Für Änderungen fragen Sie die Eigentümerin oder einen Verwalter.",
        )


# Rollen, die verwalten dürfen. `member` und `viewer` arbeiten im Bestand,
# aber sie ändern keine Schlüssel, laden niemanden ein und spielen keine
# Sicherung zurück — mit offenem Eingang ist das nicht mehr verhandelbar.
VERWALTET = ("owner", "admin")


async def verwaltet(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Abhängigkeit für die Endpunkte mit der größten Sprengkraft.

    Geprüft wird die Rolle der **angemeldeten** Person in der
    Organisation ihrer Sitzung.
    """
    async with acquire() as conn:
        stand = await conn.fetchrow(
            "select role::text as rolle, sicht from public.user_org_roles where user_id = $1 and org_id = $2",
            user.handelnder, user.org_id,
        )
    if stand is None or stand["rolle"] not in VERWALTET:
        raise HTTPException(403, "Dafür fehlt Ihnen die Berechtigung. Fragen Sie den Eigentümer.")
    # Verwalten heißt: über den ganzen Bestand. Wer nur einen Ausschnitt
    # sieht, zöge eine halbe Sicherung oder vergäbe Zugriffe auf Firmen, die
    # er selbst nicht kennt. Die API lässt das nicht entstehen (sicht.py),
    # hier steht es noch einmal, falls es doch einmal so in der Datenbank
    # steht.
    if stand["sicht"] != "alles":
        raise HTTPException(403, "Verwalten kann nur, wer den ganzen Bestand sieht.")
    return user
