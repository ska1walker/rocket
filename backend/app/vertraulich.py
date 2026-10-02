"""Vertrauliche Feldgruppen (seit 26.10.18).

Eine Eigenschaftsgruppe kann vertraulich sein — im Verein „Beitrag und
Bank“, im Vertrieb etwa Konditionen. Die Werte ihrer Felder liegen dann
nicht in `custom`, sondern in `vertrauliche_werte`; die Zeilensicherheit
dort (0039) lässt nur durch, wer Eigentümerin oder Verwalter ist oder den
Schalter „sieht vertrauliche Felder“ hat, und nur am Datensatz, den die
Person ohnehin sieht.

Deshalb muss die Anwendung beim **Lesen** nichts verbergen: Die Abfragen
holen die Werte mit einer Unterabfrage dazu (`SPALTE`), und wer sie nicht
sehen darf, bekommt dort nichts. Liste, Datensatz, Filter, Sortierung und
Ausfuhr nehmen denselben Weg. Die Suche und die Fragen an den Bestand
lesen nur `custom` — vertrauliche Werte erreichen nie ein Sprachmodell.

Beim **Schreiben** trennt `aufteilen` die Werte, `schreiben` legt die
vertraulichen ab. Wird eine Gruppe vertraulich (oder ein Feld wandert in
eine), zieht `abgleichen` die vorhandenen Werte um — in beide Richtungen.
"""

from typing import Any
from uuid import UUID

import asyncpg
import orjson
from fastapi import HTTPException

ENTITAETEN = ("companies", "contacts", "deals")

# Wie die Abfragen die vertraulichen Werte eines Datensatzes dazuholen.
# Ohne Recht liefert die Unterabfrage nichts — die Zeilensicherheit filtert.
_UNTERABFRAGE = (
    "(select v.werte from public.vertrauliche_werte v "
    "where v.entity = '{entity}' and v.record_id = {alias}.id)"
)


def spalte(entity: str, alias: str) -> str:
    """Die Unterabfrage als zusätzliche Spalte `custom_vertraulich`."""
    return _UNTERABFRAGE.format(entity=entity, alias=alias) + " as custom_vertraulich"


def custom_voll(entity: str, alias: str) -> str:
    """`custom` samt vertraulicher Werte — für Filter und Sortierung."""
    return (
        f"({alias}.custom || coalesce({_UNTERABFRAGE.format(entity=entity, alias=alias)}, "
        "'{}'::jsonb))"
    )


def zusammen(custom: Any, vertraulich: Any) -> dict[str, Any]:
    """Führt beide Ablagen für die Antwort zusammen."""
    offen = _dict(custom)
    geheim = _dict(vertraulich)
    return {**offen, **geheim} if geheim else offen


def _dict(wert: Any) -> dict[str, Any]:
    if not wert:
        return {}
    if isinstance(wert, str | bytes):
        return orjson.loads(wert)
    return dict(wert)


async def darf(conn: asyncpg.Connection) -> bool:
    """Darf die handelnde Person vertrauliche Felder sehen und ändern?"""
    return bool(await conn.fetchval("select public.sieht_vertrauliches()"))


async def felder(conn: asyncpg.Connection, entity: str) -> dict[str, str]:
    """Schlüssel → Bezeichnung aller Felder in vertraulichen Gruppen.

    Auch abgeschaltete: Ihre Werte bleiben stehen und bleiben vertraulich.
    """
    zeilen = await conn.fetch(
        """
        select d.key, d.label
          from public.property_definitions d
          join public.property_groups g on g.id = d.group_id
         where d.entity = $1 and g.vertraulich and not d.is_system
        """,
        entity,
    )
    return {z["key"]: z["label"] for z in zeilen}


async def aufteilen(
    conn: asyncpg.Connection, entity: str, werte: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Geprüfte Werte → (für `custom`, für `vertrauliche_werte`).

    Wer vertrauliche Felder nicht sehen darf, darf sie auch nicht setzen —
    nicht einmal leeren. Die Antwort nennt das Feld; dass es das Feld gibt,
    ist kein Geheimnis, nur sein Wert.
    """
    if not werte:
        return {}, {}
    geheim = await felder(conn, entity)
    offen = {k: v for k, v in werte.items() if k not in geheim}
    vertraulich = {k: v for k, v in werte.items() if k in geheim}
    if vertraulich and not await darf(conn):
        namen = ", ".join(f"„{geheim[k]}“" for k in vertraulich)
        raise HTTPException(403, f"{namen}: vertraulich. Dafür fehlt Ihnen der Zugriff.")
    return offen, vertraulich


async def schreiben(
    conn: asyncpg.Connection, org_id: UUID, entity: str, record_id: UUID, werte: dict[str, Any]
) -> None:
    """Führt vertrauliche Werte zusammen; `null` löscht einen Wert."""
    if not werte:
        return
    await conn.execute(
        """
        insert into public.vertrauliche_werte (org_id, entity, record_id, werte)
        values ($1, $2, $3, jsonb_strip_nulls($4::jsonb))
        on conflict (entity, record_id) do update
          set werte = jsonb_strip_nulls(public.vertrauliche_werte.werte || $4::jsonb),
              updated_at = now()
        """,
        org_id, entity, record_id, orjson.dumps(werte).decode(),
    )


def fuer_protokoll(diff: dict[str, Any], vertraulich: dict[str, Any]) -> dict[str, Any]:
    """Das Audit-Log nennt, *dass* ein vertrauliches Feld geändert wurde,
    nicht den Wert — sonst stünde die Bankverbindung im Protokoll."""
    if not vertraulich:
        return diff
    custom = diff.get("custom") if isinstance(diff.get("custom"), dict) else {}
    return {**diff, "custom": {**custom, **dict.fromkeys(vertraulich, "(vertraulich)")}}


async def abgleichen(conn: asyncpg.Connection, entity: str) -> None:
    """Bringt jeden Wert dorthin, wo er nach den Gruppen hingehört.

    Nach jeder Änderung, die ein Feld vertraulich macht oder davon befreit:
    Gruppe umgeschaltet, Feld in eine andere Gruppe gezogen, Gruppe
    gelöscht. Läuft als verwaltende Person (sieht alles) in deren
    Transaktion; ein Fehler nimmt die Änderung an der Gruppe mit zurück.
    """
    if entity not in ENTITAETEN:
        return
    geheim = list(await felder(conn, entity))

    # Hinaus: was nicht mehr vertraulich ist, zurück nach `custom`.
    await conn.execute(
        f"""
        update public.{entity} t
           set custom = coalesce(t.custom, '{{}}'::jsonb) || (
                 select jsonb_object_agg(e.key, e.value) from jsonb_each(v.werte) e
                  where e.key <> all($2::text[]))
          from public.vertrauliche_werte v
         where v.entity = $1 and v.record_id = t.id
           and exists (select 1 from jsonb_object_keys(v.werte) k where k <> all($2::text[]))
        """,
        entity, geheim,
    )
    await conn.execute(
        """
        update public.vertrauliche_werte v
           set werte = (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                          from jsonb_each(v.werte) e where e.key = any($2::text[])),
               updated_at = now()
         where v.entity = $1
           and exists (select 1 from jsonb_object_keys(v.werte) k where k <> all($2::text[]))
        """,
        entity, geheim,
    )
    await conn.execute(
        "delete from public.vertrauliche_werte where entity = $1 and werte = '{}'::jsonb", entity
    )
    if not geheim:
        return

    # Hinein: was vertraulich geworden ist, aus `custom` heraus.
    await conn.execute(
        f"""
        insert into public.vertrauliche_werte (org_id, entity, record_id, werte)
        select t.org_id, $1, t.id,
               (select coalesce(jsonb_object_agg(e.key, e.value), '{{}}'::jsonb)
                  from jsonb_each(t.custom) e
                 where e.key = any($2::text[]) and e.value <> 'null'::jsonb)
          from public.{entity} t
         where t.custom ?| $2::text[]
        on conflict (entity, record_id) do update
          set werte = public.vertrauliche_werte.werte || excluded.werte, updated_at = now()
        """,
        entity, geheim,
    )
    await conn.execute(
        f"update public.{entity} set custom = custom - $1::text[] where custom ?| $1::text[]",
        geheim,
    )
    await conn.execute(
        "delete from public.vertrauliche_werte where entity = $1 and werte = '{}'::jsonb", entity
    )
