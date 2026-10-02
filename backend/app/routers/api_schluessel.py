"""API-Schlüssel verwalten — erzeugen, auflisten, widerrufen.

Nur Eigentümer und Verwalter, und nur in einer Sitzung: Kein Bereich
eines Schlüssels deckt diese Pfade ab (`app/api_schluessel.py`), ein
Schlüssel kann also keine weiteren Schlüssel erzeugen.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app import anmeldung as anmeldung_kern
from app import api_schluessel, audit
from app.auth import CurrentUser, verwaltet
from app.db import acquire_as

router = APIRouter(prefix="/api/api-schluessel", tags=["api-schluessel"])


class SchluesselIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    bereiche: list[str] = Field(default_factory=lambda: ["eigenschaften"], min_length=1)
    laeuft_ab: datetime | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, wert: str) -> str:
        wert = wert.strip()
        if not wert:
            raise ValueError("Der Name darf nicht leer sein.")
        return wert

    @field_validator("bereiche")
    @classmethod
    def _bereiche(cls, werte: list[str]) -> list[str]:
        unbekannt = [w for w in werte if w not in api_schluessel.BEREICHE]
        if unbekannt:
            raise ValueError(f"Unbekannter Bereich: {', '.join(unbekannt)}")
        return sorted(set(werte))


class Schluessel(BaseModel):
    id: UUID
    name: str
    praefix: str
    bereiche: list[str]
    erstellt_von: str | None
    erstellt_am: datetime
    zuletzt_benutzt: datetime | None
    laeuft_ab: datetime | None
    widerrufen_am: datetime | None


class SchluesselNeu(Schluessel):
    # Der Schlüssel im Klartext — nur in dieser einen Antwort.
    schluessel: str


_SPALTEN = """
    s.id, s.name, s.praefix, s.bereiche, s.erstellt_am, s.zuletzt_benutzt,
    s.laeuft_ab, s.widerrufen_am,
    coalesce(u.display_name, u.olares_username) as erstellt_von
"""


@router.get("", response_model=list[Schluessel])
async def liste(user: CurrentUser = Depends(verwaltet)) -> list[Schluessel]:
    async with acquire_as(user.user_id) as conn:
        zeilen = await conn.fetch(
            f"select {_SPALTEN} from public.api_schluessel s "
            "left join public.users u on u.id = s.user_id "
            "where s.org_id = $1 order by s.widerrufen_am is not null, s.erstellt_am desc",
            user.org_id,
        )
    return [Schluessel(**dict(z)) for z in zeilen]


@router.post("", response_model=SchluesselNeu, status_code=201)
async def erzeugen(payload: SchluesselIn, user: CurrentUser = Depends(verwaltet)) -> SchluesselNeu:
    """Erzeugt einen Schlüssel und zeigt ihn genau einmal."""
    if payload.laeuft_ab is not None and payload.laeuft_ab.timestamp() <= datetime.now().timestamp():
        raise HTTPException(400, "Das Ablaufdatum liegt in der Vergangenheit.")
    token = api_schluessel.neu()
    async with acquire_as(user.user_id) as conn:
        zeile = await conn.fetchrow(
            "insert into public.api_schluessel (org_id, user_id, name, praefix, token_hash, bereiche, laeuft_ab) "
            "values ($1, $2, $3, $4, $5, $6, $7) returning id",
            user.org_id, user.user_id, payload.name, token[:10],
            anmeldung_kern.token_hash(token), payload.bereiche, payload.laeuft_ab,
        )
        await audit.log_fuer(
            conn, user, action="create", entity="api_schluessel", entity_id=zeile["id"],
            diff={"name": payload.name, "bereiche": payload.bereiche},
        )
        neu = await conn.fetchrow(
            f"select {_SPALTEN} from public.api_schluessel s "
            "left join public.users u on u.id = s.user_id where s.id = $1",
            zeile["id"],
        )
    return SchluesselNeu(**dict(neu), schluessel=token)


@router.delete("/{schluessel_id}", status_code=204)
async def widerrufen(schluessel_id: UUID, user: CurrentUser = Depends(verwaltet)) -> None:
    """Widerruft sofort. Die Zeile bleibt, damit das Protokoll weiß, wer
    „api:<Name>“ war."""
    async with acquire_as(user.user_id) as conn:
        weg = await conn.fetchval(
            "update public.api_schluessel set widerrufen_am = coalesce(widerrufen_am, now()) "
            "where id = $1 and org_id = $2 returning id",
            schluessel_id, user.org_id,
        )
        if weg is None:
            raise HTTPException(404, "Schlüssel nicht gefunden")
        await audit.log_fuer(
            conn, user, action="delete", entity="api_schluessel", entity_id=schluessel_id,
        )
