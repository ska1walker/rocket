"""API-Schlüssel — Rocket von außen aufrufen, ohne Browser.

Ein Programm (Skript, Make, n8n, Claude) schickt
`Authorization: Bearer rk_…` und handelt dann im Namen der Person, die den
Schlüssel erzeugt hat — mit ihrer **jeweils aktuellen** Rolle. Wird sie
vom Verwalter zum Mitglied, kann ihr Schlüssel nur noch lesen; wird sie
entfernt, gilt er nicht mehr.

Ein Schlüssel darf nur in seine **Bereiche** (`BEREICHE`). Der erste ist
`eigenschaften`. Schlüssel selbst verwalten kann kein Schlüssel: Kein
Bereich deckt `/api/api-schluessel` ab, und der Router verlangt
ohnehin eine Sitzung (siehe `routers/api_schluessel.py`).

Gespeichert wird nur der SHA-256 (Migration 0036). Der Klartext existiert
genau einmal, in der Antwort auf das Erzeugen.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from app import anmeldung as anmeldung_kern

PRAEFIX = "rk_"

# Bereich → Pfade, die er öffnet. Ein Pfad gehört dazu, wenn er genau so
# heißt oder mit „/“ darunter weitergeht — `/api/eigenschaftenX` nicht.
BEREICHE: dict[str, tuple[str, ...]] = {
    "eigenschaften": ("/api/eigenschaften",),
}

BEREICH_NAMEN: dict[str, str] = {
    "eigenschaften": "Eigenschaften",
}


def neu() -> str:
    return PRAEFIX + secrets.token_urlsafe(32)


def ist_schluessel(token: str) -> bool:
    return token.startswith(PRAEFIX) and len(token) > len(PRAEFIX) + 20


def erlaubt(bereiche: list[str] | tuple[str, ...], pfad: str) -> bool:
    for bereich in bereiche:
        for wurzel in BEREICHE.get(bereich, ()):
            if pfad == wurzel or pfad.startswith(wurzel + "/"):
                return True
    return False


@dataclass(frozen=True)
class Gueltig:
    id: UUID
    user_id: UUID
    org_id: UUID
    name: str
    bereiche: tuple[str, ...]


async def pruefen(conn: asyncpg.Connection, token: str) -> Gueltig | None:
    """Der gültige Schlüssel zu diesem Token — oder nichts.

    Gültig heißt: nicht widerrufen, nicht abgelaufen. Ob die Person noch
    da und Mitglied ist, prüft der Aufrufer (`auth`), weil er dafür einen
    Nutzerkontext braucht. `zuletzt_benutzt` wird höchstens einmal je
    Minute geschrieben — ein Skript, das hundert Felder umbenennt, soll
    nicht hundert Schreibvorgänge auf dieselbe Zeile auslösen.
    """
    if not ist_schluessel(token):
        return None
    hash_wert = anmeldung_kern.token_hash(token)
    async with conn.transaction():
        await anmeldung_kern._pinnen(conn, hash_wert)
        zeile = await conn.fetchrow(
            """
            select id, user_id, org_id, name, bereiche,
                   zuletzt_benutzt is null or zuletzt_benutzt < now() - interval '1 minute' as fortschreiben
              from public.api_schluessel
             where token_hash = $1
               and widerrufen_am is null
               and (laeuft_ab is null or laeuft_ab > now())
            """,
            hash_wert,
        )
        if zeile is None:
            return None
        if zeile["fortschreiben"]:
            await conn.execute(
                "update public.api_schluessel set zuletzt_benutzt = now() where token_hash = $1",
                hash_wert,
            )
    return Gueltig(
        id=zeile["id"],
        user_id=zeile["user_id"],
        org_id=zeile["org_id"],
        name=zeile["name"],
        bereiche=tuple(zeile["bereiche"] or ()),
    )
