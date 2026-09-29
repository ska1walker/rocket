"""Tabellen ansehen und lesend abfragen — nur für Verwalter.

Alles läuft über `acquire_as`, also unter der Zeilensicherheit: Man sieht
die eigene Organisation und sonst nichts, genau wie überall in Rocket.
Jede Transaktion ist `READ ONLY` und hat ein Zeitlimit. Was im SQL-Feld
steht, prüft vorher `app.datenbank.pruefen` — warum das nötig ist, steht
dort.

Protokolliert wird jede SQL-Abfrage, auch eine abgewiesene, und jede
Ausfuhr. Das Blättern in einer Tabelle nicht: Es zeigt nichts, was die
übrigen Seiten nicht auch zeigen.
"""

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import audit, csvform
from app.auth import CurrentUser, verwaltet
from app.datenbank import (
    FREI,
    GESPERRT,
    HOECHSTENS_ZEILEN,
    ZEITLIMIT_MS,
    Abgewiesen,
    pruefen,
    wert,
    zelle,
)
from app.db import acquire_as

router = APIRouter(prefix="/api/datenbank", tags=["datenbank"])

JE_SEITE = 50
# Die Ausfuhr darf mehr als der Bildschirm — sie wird zeilenweise
# geschrieben, nicht im Speicher gesammelt.
HOECHSTENS_AUSFUHR = 100_000


class Spalte(BaseModel):
    name: str
    typ: str


class Tabelle(BaseModel):
    name: str
    zeilen: int
    spalten: list[Spalte]


class Gesperrt(BaseModel):
    name: str
    grund: str


class Uebersicht(BaseModel):
    frei: list[Tabelle]
    gesperrt: list[Gesperrt]


class Seite(BaseModel):
    spalten: list[str]
    zeilen: list[list[Any]]
    gesamt: int
    seite: int
    je_seite: int


class Abfrage(BaseModel):
    sql: str = Field(max_length=20_000)


class Ergebnis(BaseModel):
    spalten: list[str]
    zeilen: list[list[Any]]
    abgeschnitten: bool
    dauer_ms: int


@asynccontextmanager
async def _lesend(user: CurrentUser) -> AsyncIterator[asyncpg.Connection]:
    """Eine Verbindung unter Zeilensicherheit, die nichts schreiben kann."""
    async with acquire_as(user.user_id) as conn:
        await conn.execute("set transaction read only")
        await conn.execute(f"set local statement_timeout = {ZEITLIMIT_MS}")
        yield conn


def _bezeichner(name: str) -> str:
    """Tabellen- und Spaltennamen kommen aus dem Katalog, nie vom Aufrufer
    — gequotet wird trotzdem."""
    return '"' + name.replace('"', '""') + '"'


async def _spalten(conn: asyncpg.Connection, tabellen: list[str]) -> dict[str, list[Spalte]]:
    zeilen = await conn.fetch(
        """
        select table_name, column_name, data_type
          from information_schema.columns
         where table_schema = 'public' and table_name = any($1::text[])
         order by table_name, ordinal_position
        """,
        tabellen,
    )
    ergebnis: dict[str, list[Spalte]] = {}
    for z in zeilen:
        ergebnis.setdefault(z["table_name"], []).append(Spalte(name=z["column_name"], typ=z["data_type"]))
    return ergebnis


def _datenbankfehler(fehler: Exception) -> HTTPException:
    if isinstance(fehler, asyncpg.QueryCanceledError):
        return HTTPException(400, f"Die Abfrage hat länger als {ZEITLIMIT_MS // 1000} Sekunden gebraucht und wurde abgebrochen.")
    if isinstance(fehler, asyncpg.ReadOnlySQLTransactionError):
        return HTTPException(400, "Hier wird nur gelesen — die Abfrage wollte etwas ändern.")
    return HTTPException(400, f"Die Datenbank sagt: {fehler}")


@router.get("/tabellen", response_model=Uebersicht)
async def tabellen(user: CurrentUser = Depends(verwaltet)) -> Uebersicht:
    async with _lesend(user) as conn:
        vorhanden = {
            r["table_name"]
            for r in await conn.fetch(
                "select table_name from information_schema.tables "
                "where table_schema = 'public' and table_type = 'BASE TABLE'"
            )
        }
        namen = sorted(FREI & vorhanden)
        spalten = await _spalten(conn, namen)
        frei = [
            Tabelle(
                name=name,
                zeilen=await conn.fetchval(f"select count(*) from public.{_bezeichner(name)}"),
                spalten=spalten.get(name, []),
            )
            for name in namen
        ]
    return Uebersicht(
        frei=frei,
        gesperrt=[Gesperrt(name=n, grund=g) for n, g in sorted(GESPERRT.items())],
    )


@router.get("/tabellen/{name}", response_model=Seite)
async def tabelle(
    name: str,
    seite: int = Query(1, ge=1),
    sort: str | None = Query(None),
    richtung: str = Query("asc", pattern="^(asc|desc)$"),
    spalte: str | None = Query(None, description="Worin gesucht wird"),
    suche: str | None = Query(None, max_length=200),
    user: CurrentUser = Depends(verwaltet),
) -> Seite:
    if name in GESPERRT:
        raise HTTPException(403, f"„{name}“ ist gesperrt: {GESPERRT[name]}.")
    if name not in FREI:
        raise HTTPException(404, f"„{name}“ ist keine freigegebene Tabelle.")

    async with _lesend(user) as conn:
        spalten = [s.name for s in (await _spalten(conn, [name])).get(name, [])]
        if not spalten:
            raise HTTPException(404, f"Die Tabelle „{name}“ gibt es in dieser Installation nicht.")
        for gewaehlt in (sort, spalte):
            if gewaehlt and gewaehlt not in spalten:
                raise HTTPException(400, f"„{gewaehlt}“ ist keine Spalte von {name}.")

        args: list[Any] = []
        wo = ""
        if spalte and suche:
            args.append(f"%{suche}%")
            wo = f" where {_bezeichner(spalte)}::text ilike $1"
        quelle = f"from public.{_bezeichner(name)}{wo}"
        # Ohne Sortierung wäre die Reihenfolge beim Blättern zufällig —
        # dieselbe Zeile auf zwei Seiten, eine andere auf keiner.
        ordnung = _bezeichner(sort or spalten[0])

        gesamt = await conn.fetchval(f"select count(*) {quelle}", *args)
        zeilen = await conn.fetch(
            f"select * {quelle} order by {ordnung} {richtung} nulls last "
            f"limit {JE_SEITE} offset {(seite - 1) * JE_SEITE}",
            *args,
        )
    return Seite(
        spalten=spalten,
        zeilen=[[wert(z[s]) for s in spalten] for z in zeilen],
        gesamt=gesamt,
        seite=seite,
        je_seite=JE_SEITE,
    )


async def _protokoll(user: CurrentUser, action: str, sql: str, **mehr: Any) -> None:
    # Eigene Transaktion: Die Abfrage selbst läuft READ ONLY und könnte
    # ihren Protokolleintrag gar nicht schreiben.
    async with acquire_as(user.user_id) as conn:
        await audit.log_fuer(
            conn, user, action=action, entity="datenbank", entity_id=None,
            diff={"sql": sql[:2000], **mehr},
        )


@router.post("/abfrage", response_model=Ergebnis)
async def abfrage(koerper: Abfrage, user: CurrentUser = Depends(verwaltet)) -> Ergebnis:
    try:
        pruefen(koerper.sql)
    except Abgewiesen as grund:
        await _protokoll(user, "sql", koerper.sql, abgewiesen=str(grund))
        raise HTTPException(400, str(grund)) from None

    beginn = time.monotonic()
    try:
        async with _lesend(user) as conn:
            anweisung = await conn.prepare(koerper.sql)
            spalten = [a.name for a in anweisung.get_attributes()]
            zeiger = await anweisung.cursor()
            zeilen = await zeiger.fetch(HOECHSTENS_ZEILEN + 1)
    except asyncpg.PostgresError as fehler:
        await _protokoll(user, "sql", koerper.sql, fehler=str(fehler))
        raise _datenbankfehler(fehler) from None
    dauer = int((time.monotonic() - beginn) * 1000)

    abgeschnitten = len(zeilen) > HOECHSTENS_ZEILEN
    zeilen = zeilen[:HOECHSTENS_ZEILEN]
    await _protokoll(user, "sql", koerper.sql, zeilen=len(zeilen))
    return Ergebnis(
        spalten=spalten,
        zeilen=[[wert(v) for v in z.values()] for z in zeilen],
        abgeschnitten=abgeschnitten,
        dauer_ms=dauer,
    )


@router.post("/abfrage/csv")
async def abfrage_csv(koerper: Abfrage, user: CurrentUser = Depends(verwaltet)) -> StreamingResponse:
    """Dasselbe Ergebnis als Datei. Sie verlässt die Box und steht deshalb
    im Protokoll wie jede andere Ausfuhr."""
    try:
        pruefen(koerper.sql)
    except Abgewiesen as grund:
        await _protokoll(user, "export", koerper.sql, abgewiesen=str(grund))
        raise HTTPException(400, str(grund)) from None

    # Die Spalten vorab: Ein Fehler im SQL soll als 400 ankommen, nicht
    # mitten in einer schon laufenden Datei.
    try:
        async with _lesend(user) as conn:
            spalten = [a.name for a in (await conn.prepare(koerper.sql)).get_attributes()]
    except asyncpg.PostgresError as fehler:
        raise _datenbankfehler(fehler) from None

    async def stuecke():
        stapel = csvform.Stapel()
        yield stapel.kopfzeile(spalten)
        gezaehlt = 0
        async with _lesend(user) as conn:
            async for satz in conn.cursor(koerper.sql):
                gezaehlt += 1
                if gezaehlt > HOECHSTENS_AUSFUHR:
                    break
                # Formelschutz: Ein Feld, das mit „=" beginnt, ist in Excel
                # sonst eine Formel — auch wenn es aus der eigenen Datenbank kommt.
                stueck = stapel.dazu([csvform.formelschutz(zelle(v)) for v in satz.values()])
                if stueck:
                    yield stueck
        letztes = stapel.rest()
        if letztes:
            yield letztes
        await _protokoll(user, "export", koerper.sql, zeilen=min(gezaehlt, HOECHSTENS_AUSFUHR))

    return StreamingResponse(
        stuecke(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="rocket-abfrage-{date.today().isoformat()}.csv"',
            "X-Content-Type-Options": "nosniff",
        },
    )
