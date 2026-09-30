"""Definitionen eigener Eigenschaften — anlegen, ändern, abschalten."""

import json
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app import audit, eigenschaften
from app.auth import CurrentUser, get_current_user, verwaltet
from app.db import acquire_as

router = APIRouter(prefix="/api/eigenschaften", tags=["eigenschaften"])

Entity = Literal["companies", "contacts", "deals"]
Kind = Literal[
    "text", "number", "date", "bool", "select", "multiselect",
    "textarea", "url", "email", "phone", "currency", "user",
]
# Beide führen eine Optionsliste; nur die Anzahl gleichzeitiger Werte
# unterscheidet sie.
MIT_OPTIONEN = ("select", "multiselect")


class Option(BaseModel):
    """Eine wählbare Option — mit festem Wert und freier Beschriftung.

    `wert` ist das, was in den Datensätzen steht, und ändert sich nie.
    `text` ist das, was jemand liest, und darf sich jederzeit ändern.
    Wer beides gleichsetzt, kann eine Beschriftung nie wieder korrigieren,
    ohne die vorhandenen Werte zu entwerten — genau der Fehler, den
    HubSpot mit derselben Trennung vermeidet.

    `verborgen` ist archiviert: aus der Auswahl genommen, in den
    Datensätzen unverändert gültig.
    """

    wert: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=200)
    verborgen: bool = False


def _optionen_aus(roh: Any) -> list[Option]:
    """Nimmt Texte oder Objekte entgegen und macht Optionen daraus.

    Die kurze Form (`["Nord", "Süd"]`) bleibt gültig: Ein Import oder ein
    schnell getippter Aufruf soll nicht an einer Objektform scheitern.
    Ein neuer Wert ohne `wert` bekommt seine Beschriftung als Wert — so
    wie HubSpot es bei „Add option" vorbelegt.
    """
    fertig: list[Option] = []
    for o in roh or []:
        if isinstance(o, str):
            if o.strip():
                fertig.append(Option(wert=o.strip(), text=o.strip()))
            continue
        opt = o if isinstance(o, Option) else Option(**o)
        text = opt.text.strip()
        if not text:
            continue
        fertig.append(Option(wert=(opt.wert.strip() or text), text=text, verborgen=opt.verborgen))
    return fertig


class DefinitionIn(BaseModel):
    entity: Entity
    label: str = Field(min_length=1, max_length=80)
    kind: Kind = "text"
    options: list[Option | str] = []
    description: str | None = None
    position: int = 0
    # Ohne Angabe: „Weitere Eigenschaften".
    group_id: UUID | None = None


class DefinitionPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    options: list[Option | str] | None = None
    description: str | None = None
    position: int | None = None
    is_active: bool | None = None
    # Im Anlegen-Dialog zeigen (Stufe B).
    im_anlegen: bool | None = None
    # Pflichtfeld (Stufe C): beim Anlegen gefüllt, beim Ändern nicht geleert.
    required: bool | None = None


class Definition(BaseModel):
    id: UUID
    entity: str
    key: str
    label: str
    kind: str
    options: list[Option] = []
    description: str | None = None
    position: int
    is_active: bool
    group_id: UUID | None = None
    is_system: bool = False
    required: bool = False
    im_anlegen: bool = False
    created_at: datetime


def _aus_zeile(z: Any) -> Definition:
    d = dict(z)
    d["options"] = [Option(**o) for o in eigenschaften.optionen(d.get("options"))]
    return Definition(**d)


def _geprueft(optionen: list[Option], kind: str) -> list[Option]:
    """Eine Optionsliste, die eine Wahl ist: nicht leer, ohne Doppelte."""
    if kind in MIT_OPTIONEN and not optionen:
        raise HTTPException(400, "Eine Auswahl braucht mindestens einen erlaubten Wert.")
    werte = [o.wert for o in optionen]
    if len(werte) != len(set(werte)):
        raise HTTPException(400, "Zwei gleiche Werte in der Auswahl sind keine Wahl.")
    if kind in MIT_OPTIONEN and all(o.verborgen for o in optionen):
        raise HTTPException(
            400, "Alle Werte archiviert — dann bliebe an dieser Eigenschaft nichts zu wählen."
        )
    return optionen


@router.get("", response_model=list[Definition])
async def liste(
    user: CurrentUser = Depends(get_current_user),
    entity: Entity | None = Query(None),
    auch_inaktive: bool = Query(False),
) -> list[Definition]:
    # Nur eigene Eigenschaften: Die festen Felder liefert `/anordnung`.
    # Wer diese Liste liest (Datensatzseite, Einfuhr), erwartet genau das,
    # was in `custom` steht.
    sql = "select * from public.property_definitions where not is_system"
    args: list[Any] = []
    if entity:
        args.append(entity)
        sql += f" and entity = ${len(args)}"
    if not auch_inaktive:
        sql += " and is_active"
    sql += " order by entity, position, label"
    async with acquire_as(user.user_id) as conn:
        zeilen = await conn.fetch(sql, *args)
    return [_aus_zeile(z) for z in zeilen]


@router.post("", response_model=Definition, status_code=201)
async def anlegen(
    payload: DefinitionIn,
    user: CurrentUser = Depends(verwaltet),
) -> Definition:
    optionen = _geprueft(_optionen_aus(payload.options), payload.kind)
    key = eigenschaften.schluessel_aus(payload.label)

    async with acquire_as(user.user_id) as conn:
        await eigenschaften.vorgaben_sicherstellen(conn, user.org_id, payload.entity)
        gruppe = await _gruppe_fuer(conn, user.org_id, payload.entity, payload.group_id)
        position = payload.position or await conn.fetchval(
            "select coalesce(max(position), 0) + 10 from public.property_definitions "
            "where group_id = $1", gruppe,
        )
        belegt = await conn.fetchval(
            "select id from public.property_definitions "
            "where org_id = $1 and entity = $2 and key = $3",
            user.org_id, payload.entity, key,
        )
        if belegt:
            raise HTTPException(
                409, f"Für dieses Objekt gibt es schon eine Eigenschaft mit dem Schlüssel „{key}“."
            )
        zeile = await conn.fetchrow(
            """
            insert into public.property_definitions
              (org_id, entity, key, label, kind, options, description, position, group_id)
            values ($1,$2,$3,$4,$5::public.property_kind,$6::jsonb,$7,$8,$9)
            returning *
            """,
            user.org_id, payload.entity, key, payload.label.strip(), payload.kind,
            json.dumps([o.model_dump() for o in optionen]),
            payload.description, position, gruppe,
        )
        await audit.log_fuer(
            conn, user, action="create", entity="property_definitions", entity_id=zeile["id"],
            diff={"entity": payload.entity, "key": key, "kind": payload.kind},
        )
    return _aus_zeile(zeile)


@router.patch("/{definition_id}", response_model=Definition)
async def aendern(
    definition_id: UUID,
    payload: DefinitionPatch,
    user: CurrentUser = Depends(verwaltet),
) -> Definition:
    """Beschriftung, Auswahl, Reihenfolge, Schalter. Nie Typ oder Schlüssel:
    Beides hinge sonst von den Werten ab, die schon in den Datensätzen
    liegen — ein Datum, das zur Zahl wird, ist keine Änderung, sondern
    ein Bruch."""
    felder = payload.model_dump(exclude_unset=True)
    if not felder:
        raise HTTPException(400, "Keine Änderung übergeben")

    zuweisungen: list[str] = []
    args: list[Any] = []
    for name, wert in felder.items():
        if name == "options":
            neue = _optionen_aus(wert)
            felder[name] = [o.model_dump() for o in neue]
            args.append(json.dumps(felder[name]))
            zuweisungen.append(f"options = ${len(args)}::jsonb")
        else:
            args.append(wert)
            zuweisungen.append(f"{name} = ${len(args)}")
    args.append(definition_id)

    async with acquire_as(user.user_id) as conn:
        zeile_alt = await conn.fetchrow(
            "select is_system, entity, key from public.property_definitions where id = $1",
            definition_id,
        )
        if zeile_alt is None:
            raise HTTPException(404, "Eigenschaft nicht gefunden")
        system = zeile_alt["is_system"]
        if system and felder.get("required"):
            sf = eigenschaften.systemfeld(zeile_alt["entity"], zeile_alt["key"])
            if sf is None or not sf.bearbeitbar or (zeile_alt["entity"], sf.key) in eigenschaften.NIE_PFLICHT:
                raise HTTPException(
                    400, "Dieses Feld wird gerechnet oder hat einen eigenen Weg — Pflicht kann es nicht sein."
                )
        if system and felder.get("im_anlegen"):
            sf = eigenschaften.systemfeld(zeile_alt["entity"], zeile_alt["key"])
            # Der Absagegrund entsteht beim Verlieren, nicht beim Anlegen.
            if sf is None or not sf.bearbeitbar or (zeile_alt["entity"], sf.key) == ("deals", "lost_reason"):
                raise HTTPException(
                    400, "Dieses Feld wird gerechnet oder hat einen eigenen Weg — im Anlegen-Dialog hätte es nichts zu tun."
                )
        if system and ({"options", "is_active"} & set(felder)):
            raise HTTPException(
                400,
                "Ein festes Feld behält seine Werte und bleibt da. Ändern lassen sich "
                "Beschriftung, Hilfetext und Platz.",
            )
        if "options" in felder:
            await _optionen_pruefen(conn, definition_id, [Option(**o) for o in felder["options"]])
        zeile = await conn.fetchrow(
            f"update public.property_definitions set {', '.join(zuweisungen)} "
            f"where id = ${len(args)} returning *",
            *args,
        )
        if zeile is None:
            raise HTTPException(404, "Eigenschaft nicht gefunden")
        await audit.log_fuer(
            conn, user, action="update", entity="property_definitions",
            entity_id=definition_id, diff=felder,
        )
    return _aus_zeile(zeile)


async def _optionen_pruefen(conn, definition_id: UUID, neu: list[Option]) -> None:
    """Was an der Optionsliste geändert werden darf — und was nicht.

    **Umbenennen: immer.** Die Beschriftung gehört der Oberfläche, der
    Wert den Datensätzen. Genau dafür sind es zwei Felder.

    **Archivieren: immer.** Ein archivierter Wert wird nicht mehr
    angeboten, bleibt aber gültig. Das ist der vorgesehene Weg, eine
    Option aus dem Verkehr zu ziehen.

    **Entfernen: nur, solange sie niemand benutzt.** Sonst bliebe der
    Wert zwar lesbar im JSON stehen, aber der Datensatz ließe sich nicht
    mehr speichern — die Prüfung lehnte ihn ab. Das ist die unangenehmste
    Sorte Fehler: Er entsteht in den Einstellungen und schlägt Wochen
    später bei jemand anderem an ganz anderer Stelle zu. Wer wirklich
    aufräumen will, archiviert.
    """
    d = await conn.fetchrow(
        "select entity, key, kind, options from public.property_definitions where id = $1",
        definition_id,
    )
    if d is None:
        raise HTTPException(404, "Eigenschaft nicht gefunden")
    if d["kind"] not in MIT_OPTIONEN:
        raise HTTPException(
            400, "Nur eine Auswahl oder Mehrfachauswahl führt eine Werteliste."
        )
    _geprueft(neu, d["kind"])

    bleibt = {o.wert for o in neu}
    entfernt = [o for o in eigenschaften.optionen(d["options"]) if o["wert"] not in bleibt]
    if not entfernt:
        return

    tabelle = {"companies": "companies", "contacts": "contacts", "deals": "deals"}[d["entity"]]
    for option in entfernt:
        # Ein einzelner Wert steht als jsonb-Text im Feld, eine
        # Mehrfachauswahl als Liste. `@>` trifft beide Formen.
        anzahl = await conn.fetchval(
            f"select count(*) from public.{tabelle} "
            f"where deleted_at is null and (custom -> $1) @> to_jsonb($2::text)",
            d["key"], option["wert"],
        )
        if anzahl:
            raise HTTPException(
                409,
                f"„{option['text']}“ steht noch an {anzahl} "
                f"{'Datensatz' if anzahl == 1 else 'Datensätzen'}. "
                "Archivieren Sie den Wert, statt ihn zu entfernen — dann wird er "
                "nicht mehr angeboten und bleibt dort trotzdem gültig.",
            )


@router.delete("/{definition_id}", status_code=204)
async def abschalten(definition_id: UUID, user: CurrentUser = Depends(verwaltet)) -> None:
    """Schaltet ab. Die Werte bleiben in den Datensätzen — ein Löschen, das
    sie mitnähme, wäre ein Datenverlust hinter einem harmlosen Knopf."""
    async with acquire_as(user.user_id) as conn:
        system = await conn.fetchval(
            "select is_system from public.property_definitions where id = $1", definition_id
        )
        if system is None:
            raise HTTPException(404, "Eigenschaft nicht gefunden")
        if system:
            raise HTTPException(400, "Ein festes Feld lässt sich verschieben, aber nicht entfernen.")
        await conn.execute(
            "update public.property_definitions set is_active = false where id = $1",
            definition_id,
        )
        await audit.log_fuer(
            conn, user, action="delete", entity="property_definitions", entity_id=definition_id
        )


# ── Gruppen und Anordnung (0034) ─────────────────────────────────────────


async def _gruppe_fuer(conn, org_id: UUID, entity: str, gruppe: UUID | None) -> UUID:
    """Die genannte Gruppe — sofern sie zu diesem Objekt gehört —, sonst
    „Weitere Eigenschaften"."""
    if gruppe is not None:
        gefunden = await conn.fetchval(
            "select id from public.property_groups where id = $1 and entity = $2", gruppe, entity
        )
        if gefunden is None:
            raise HTTPException(400, "Diese Gruppe gehört nicht zu diesem Objekt.")
        return gefunden
    return await conn.fetchval(
        "select id from public.property_groups where org_id = $1 and entity = $2 and key = $3",
        org_id, entity, eigenschaften.WEITERE,
    )


class Feld(BaseModel):
    """Ein Feld in der Anordnung — fest oder eigen, in derselben Form."""

    id: UUID
    key: str
    label: str
    description: str | None = None
    is_system: bool
    # Wie die Oberfläche es zeigt. Bei eigenen die Art der Definition,
    # bei festen die aus dem Code (`person`, `currency`, `url` …).
    art: str
    bearbeitbar: bool = True
    options: list[Option] = []
    required: bool = False
    im_anlegen: bool = False
    is_active: bool = True
    # Datensätze mit Wert — nur auf Wunsch (`mit_anzahl`), und `None` bei
    # Gerechnetem, das keine Spalte hat.
    anzahl: int | None = None


class Gruppe(BaseModel):
    id: UUID
    key: str
    label: str
    position: int
    is_system: bool
    felder: list[Feld]


class Anordnung(BaseModel):
    entity: str
    gruppen: list[Gruppe]
    # Abgeschaltete eigene Eigenschaften — wiederherstellbar.
    archiviert: list[Feld]


_TABELLE = {"companies": "companies", "contacts": "contacts", "deals": "deals"}


async def _anzahlen(conn, entity: str) -> dict[str, int]:
    """Wie viele Datensätze einen Wert tragen — je Schlüssel.

    Eigene Eigenschaften zählen im JSON (ein gespeichertes `null` zählt
    nicht: so löscht PATCH einen Wert), feste in ihrer Spalte, sofern es
    eine gibt. Gerechnetes bekommt keine Zahl.
    """
    tabelle = _TABELLE[entity]
    ergebnis: dict[str, int] = {
        z["key"]: z["n"] for z in await conn.fetch(
            f"select e.key, count(*)::int as n from public.{tabelle} t, "
            f"jsonb_each(t.custom) e where t.deleted_at is null and e.value <> 'null'::jsonb "
            f"group by e.key"
        )
    }
    spalten = {
        z["attname"] for z in await conn.fetch(
            "select attname from pg_attribute where attrelid = ('public.' || $1)::regclass "
            "and attnum > 0 and not attisdropped", tabelle,
        )
    }
    feste = [f.key for f in eigenschaften.SYSTEMFELDER[entity] if f.key in spalten]
    if feste:
        # Die Schlüssel stammen aus dem Katalog im Code und sind gegen die
        # echten Spalten geprüft — kein Bezeichner aus einer Anfrage.
        zeile = await conn.fetchrow(
            "select " + ", ".join(f"count({k})::int as {k}" for k in feste)
            + f" from public.{tabelle} where deleted_at is null"
        )
        ergebnis.update(dict(zeile))
    return ergebnis


def _feld(z: Any, entity: str, anzahl: dict[str, int] | None) -> Feld:
    sf = eigenschaften.systemfeld(entity, z["key"]) if z["is_system"] else None
    if sf is not None:
        art, bearbeitbar = sf.art, sf.bearbeitbar
        optionen = [Option(wert=w, text=t) for w, t in sf.optionen]
    else:
        art, bearbeitbar = str(z["kind"]), True
        optionen = [Option(**o) for o in eigenschaften.optionen(z["options"])]
    return Feld(
        id=z["id"], key=z["key"], label=z["label"], description=z["description"],
        is_system=z["is_system"], art=art, bearbeitbar=bearbeitbar, options=optionen,
        required=z["required"], im_anlegen=z["im_anlegen"], is_active=z["is_active"],
        anzahl=None if anzahl is None else anzahl.get(z["key"], 0 if not z["is_system"] else None),
    )


async def _anordnung(conn, org_id: UUID, entity: str, mit_anzahl: bool) -> Anordnung:
    await eigenschaften.vorgaben_sicherstellen(conn, org_id, entity)
    gruppen = await conn.fetch(
        "select * from public.property_groups where org_id = $1 and entity = $2 "
        "order by position, label", org_id, entity,
    )
    defs = await conn.fetch(
        "select * from public.property_definitions where org_id = $1 and entity = $2 "
        "order by position, label", org_id, entity,
    )
    anzahl = await _anzahlen(conn, entity) if mit_anzahl else None
    # Ein festes Feld, das der Katalog nicht mehr kennt (in einer neueren
    # Version entfallen), bleibt stehen, wird aber nicht gezeigt.
    sichtbar = [
        d for d in defs
        if not d["is_system"] or eigenschaften.systemfeld(entity, d["key"]) is not None
    ]
    return Anordnung(
        entity=entity,
        gruppen=[
            Gruppe(
                id=g["id"], key=g["key"], label=g["label"], position=g["position"],
                is_system=g["is_system"],
                felder=[_feld(d, entity, anzahl) for d in sichtbar
                        if d["group_id"] == g["id"] and d["is_active"]],
            )
            for g in gruppen
        ],
        archiviert=[_feld(d, entity, anzahl) for d in sichtbar if not d["is_active"]],
    )


@router.get("/anordnung", response_model=Anordnung)
async def anordnung(
    entity: Entity,
    mit_anzahl: bool = Query(False),
    user: CurrentUser = Depends(get_current_user),
) -> Anordnung:
    """Alle Felder eines Objekts, feste und eigene, in ihren Gruppen."""
    async with acquire_as(user.user_id) as conn:
        return await _anordnung(conn, user.org_id, entity, mit_anzahl)


class GruppeIn(BaseModel):
    entity: Entity
    label: str = Field(min_length=1, max_length=80)


class GruppePatch(BaseModel):
    label: str = Field(min_length=1, max_length=80)


@router.post("/gruppen", response_model=Gruppe, status_code=201)
async def gruppe_anlegen(payload: GruppeIn, user: CurrentUser = Depends(verwaltet)) -> Gruppe:
    key = eigenschaften.schluessel_aus(payload.label)
    async with acquire_as(user.user_id) as conn:
        await eigenschaften.vorgaben_sicherstellen(conn, user.org_id, payload.entity)
        zeile = await conn.fetchrow(
            """
            insert into public.property_groups (org_id, entity, key, label, position)
            values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 10
                                       from public.property_groups where org_id = $1 and entity = $2))
            on conflict (org_id, entity, key) do nothing
            returning *
            """,
            user.org_id, payload.entity, key, payload.label.strip(),
        )
        if zeile is None:
            raise HTTPException(409, f"Eine Gruppe „{payload.label.strip()}“ gibt es hier schon.")
        await audit.log_fuer(
            conn, user, action="create", entity="property_groups", entity_id=zeile["id"],
            diff={"entity": payload.entity, "label": payload.label.strip()},
        )
    return Gruppe(**{k: zeile[k] for k in ("id", "key", "label", "position", "is_system")}, felder=[])


@router.patch("/gruppen/{gruppe_id}", response_model=Gruppe)
async def gruppe_umbenennen(
    gruppe_id: UUID, payload: GruppePatch, user: CurrentUser = Depends(verwaltet)
) -> Gruppe:
    """Nur die Beschriftung — auch bei Vorgabegruppen. Der Schlüssel bleibt."""
    async with acquire_as(user.user_id) as conn:
        zeile = await conn.fetchrow(
            "update public.property_groups set label = $2 where id = $1 returning *",
            gruppe_id, payload.label.strip(),
        )
        if zeile is None:
            raise HTTPException(404, "Gruppe nicht gefunden")
        await audit.log_fuer(
            conn, user, action="update", entity="property_groups", entity_id=gruppe_id,
            diff={"label": payload.label.strip()},
        )
    return Gruppe(**{k: zeile[k] for k in ("id", "key", "label", "position", "is_system")}, felder=[])


@router.delete("/gruppen/{gruppe_id}", status_code=204)
async def gruppe_loeschen(
    gruppe_id: UUID,
    ziel: UUID | None = Query(None, description="Wohin die Felder der Gruppe gehen"),
    user: CurrentUser = Depends(verwaltet),
) -> None:
    """Löscht eine eigene Gruppe. Stehen Felder darin, nur mit Ziel —
    dieselbe Regel wie beim Löschen einer Pipeline-Stufe."""
    async with acquire_as(user.user_id) as conn, conn.transaction():
        g = await conn.fetchrow("select * from public.property_groups where id = $1", gruppe_id)
        if g is None:
            raise HTTPException(404, "Gruppe nicht gefunden")
        if g["is_system"]:
            raise HTTPException(
                400, "Eine Vorgabegruppe lässt sich umbenennen, aber nicht löschen."
            )
        belegt = await conn.fetchval(
            "select count(*) from public.property_definitions where group_id = $1", gruppe_id
        )
        if belegt:
            if ziel is None:
                raise HTTPException(
                    409,
                    f"In dieser Gruppe {'steht ein Feld' if belegt == 1 else f'stehen {belegt} Felder'}. "
                    "Wählen Sie, wohin sie gehen.",
                )
            if ziel == gruppe_id:
                raise HTTPException(400, "Das Ziel ist die Gruppe selbst.")
            passt = await conn.fetchval(
                "select id from public.property_groups where id = $1 and entity = $2",
                ziel, g["entity"],
            )
            if passt is None:
                raise HTTPException(400, "Die Zielgruppe gehört nicht zu diesem Objekt.")
            await conn.execute(
                """
                update public.property_definitions d
                   set group_id = $2,
                       position = (select coalesce(max(position), 0) from public.property_definitions
                                    where group_id = $2) + d.position
                 where d.group_id = $1
                """,
                gruppe_id, ziel,
            )
        await conn.execute("delete from public.property_groups where id = $1", gruppe_id)
        await audit.log_fuer(
            conn, user, action="delete", entity="property_groups", entity_id=gruppe_id,
            diff={"ziel": str(ziel) if ziel else None},
        )


class GruppenOrdnung(BaseModel):
    id: UUID
    felder: list[UUID]


class Reihenfolge(BaseModel):
    entity: Entity
    gruppen: list[GruppenOrdnung]


@router.put("/reihenfolge", response_model=Anordnung)
async def reihenfolge(payload: Reihenfolge, user: CurrentUser = Depends(verwaltet)) -> Anordnung:
    """Die ganze Anordnung eines Objekts in einem Zug.

    Ein Ziehen ändert oft zwei Gruppen zugleich — hier gilt alles oder
    nichts. Verlangt wird die **vollständige** Anordnung: jede Gruppe und
    jedes aktive Feld genau einmal. Eine Liste, in der eines fehlt, stammt
    aus einem veralteten Stand (jemand anderes hat inzwischen ein Feld
    angelegt); sie anzuwenden hieße, dessen Arbeit zu verschieben, ohne es
    zu sehen.
    """
    async with acquire_as(user.user_id) as conn, conn.transaction():
        await eigenschaften.vorgaben_sicherstellen(conn, user.org_id, payload.entity)
        gruppen = {
            z["id"] for z in await conn.fetch(
                "select id from public.property_groups where org_id = $1 and entity = $2",
                user.org_id, payload.entity,
            )
        }
        felder = {
            z["id"] for z in await conn.fetch(
                "select id from public.property_definitions "
                "where org_id = $1 and entity = $2 and is_active",
                user.org_id, payload.entity,
            )
        }
        genannte_gruppen = [g.id for g in payload.gruppen]
        genannte_felder = [f for g in payload.gruppen for f in g.felder]
        if (
            set(genannte_gruppen) != gruppen or len(genannte_gruppen) != len(gruppen)
            or set(genannte_felder) != felder or len(genannte_felder) != len(felder)
        ):
            raise HTTPException(
                409,
                "Die Anordnung ist nicht mehr aktuell — inzwischen hat sich etwas geändert. "
                "Bitte laden Sie die Seite neu.",
            )
        for gpos, g in enumerate(payload.gruppen):
            await conn.execute(
                "update public.property_groups set position = $2 where id = $1",
                g.id, (gpos + 1) * 10,
            )
            for fpos, fid in enumerate(g.felder):
                await conn.execute(
                    "update public.property_definitions set group_id = $2, position = $3 "
                    "where id = $1",
                    fid, g.id, (fpos + 1) * 10,
                )
        await audit.log_fuer(
            conn, user, action="update", entity="property_groups", entity_id=None,
            diff={"reihenfolge": payload.entity},
        )
        return await _anordnung(conn, user.org_id, payload.entity, False)
