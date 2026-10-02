"""Wer was sieht: Sicht, Zugriffe, Bereiche, Beziehungen (seit 26.10.15).

Die Regeln selbst stehen in der Datenbank (0037_sicht_und_zugriff.sql),
nicht hier. Dieser Router pflegt nur, woraus sie rechnen:

- **Sicht** einer Person: `alles` (Vorgabe) oder `eingeschraenkt`.
- **Zugriffe** einer eingeschränkten Person: Firma oder Bereich, je mit
  `lesen` oder `bearbeiten`.
- **Bereiche**: Gruppen von Firmen. Ein Zugriff auf einen Bereich gilt für
  jede Firma darin, auch für eine, die erst später hineinkommt.
- **Beziehungen** zwischen Kontakten. Wer einen Kontakt sieht, sieht auch
  seine Bezugspersonen (im Verein: die Eltern des Kindes).

Im Vertrieb heißt das „Außendienst Nord sieht das Gebiet Nord“, im Verein
„der Trainer sieht seine Mannschaft“ — dieselbe Mechanik.
"""

from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app import audit
from app.auth import CurrentUser, get_current_user, verwaltet
from app.db import acquire_as

router = APIRouter(tags=["sicht"])


# ── Sicht und Zugriffe einer Person ──────────────────────────────────────


class Zugriff(BaseModel):
    company_id: UUID | None = None
    bereich_id: UUID | None = None
    stufe: Literal["lesen", "bearbeiten"] = "bearbeiten"
    # Nur in der Antwort: wie die Firma oder der Bereich heißt.
    name: str | None = None

    @model_validator(mode="after")
    def _genau_eines(self) -> "Zugriff":
        if (self.company_id is None) == (self.bereich_id is None):
            raise ValueError("Je Zugriff genau eines: company_id oder bereich_id.")
        return self


class Sicht(BaseModel):
    sicht: Literal["alles", "eingeschraenkt"]
    zugriffe: list[Zugriff] = Field(default_factory=list, max_length=500)


async def _sicht_lesen(conn: asyncpg.Connection, user_id: UUID, org_id: UUID) -> Sicht:
    sicht = await conn.fetchval(
        "select sicht from public.user_org_roles where user_id = $1 and org_id = $2",
        user_id, org_id,
    )
    if sicht is None:
        raise HTTPException(404, "Nicht in dieser Organisation")
    zeilen = await conn.fetch(
        """
        select z.company_id, z.bereich_id, z.stufe, coalesce(c.name, b.name) as name
          from public.zugriffe z
          left join public.companies c on c.id = z.company_id
          left join public.bereiche b on b.id = z.bereich_id
         where z.user_id = $1 and z.org_id = $2
         order by (z.bereich_id is null), lower(coalesce(c.name, b.name))
        """,
        user_id, org_id,
    )
    return Sicht(sicht=sicht, zugriffe=[Zugriff(**dict(z)) for z in zeilen])


@router.get("/api/mitglieder/{mitglied_id}/sicht", response_model=Sicht)
async def sicht_lesen(mitglied_id: UUID, user: CurrentUser = Depends(get_current_user)) -> Sicht:
    """Die eigene Sicht sieht jede Person, fremde nur, wer verwaltet."""
    if mitglied_id != user.handelnder:
        await verwaltet(user)
    async with acquire_as(user.user_id) as conn:
        return await _sicht_lesen(conn, mitglied_id, user.org_id)


@router.put("/api/mitglieder/{mitglied_id}/sicht", response_model=Sicht)
async def sicht_setzen(
    mitglied_id: UUID,
    payload: Sicht,
    user: CurrentUser = Depends(verwaltet),
) -> Sicht:
    """Setzt Sicht und Zugriffe einer Person auf einmal — alles oder nichts.

    Wer verwaltet (Eigentümerin, Verwalter), sieht immer alles: Eine halbe
    Sicherung oder Zugriffe auf Firmen, die man selbst nicht sieht, gingen
    schief. Sich selbst einschränken geht deshalb auch nicht.
    """
    if payload.sicht == "alles" and payload.zugriffe:
        raise HTTPException(400, "Wer alles sieht, braucht keine Zugriffe.")
    async with acquire_as(user.user_id) as conn, conn.transaction():
        rolle = await conn.fetchval(
            "select role::text from public.user_org_roles where user_id = $1 and org_id = $2",
            mitglied_id, user.org_id,
        )
        if rolle is None:
            raise HTTPException(404, "Nicht in dieser Organisation")
        if payload.sicht == "eingeschraenkt" and rolle in ("owner", "admin"):
            raise HTTPException(
                400,
                "Eigentümerin und Verwalter sehen immer alles. Nehmen Sie zuerst die Verwaltung zurück.",
            )

        firmen = [z.company_id for z in payload.zugriffe if z.company_id]
        bereiche = [z.bereich_id for z in payload.zugriffe if z.bereich_id]
        if len(set(firmen)) != len(firmen) or len(set(bereiche)) != len(bereiche):
            raise HTTPException(400, "Jede Firma und jeder Bereich nur einmal.")
        if firmen:
            gefunden = await conn.fetchval(
                "select count(*) from public.companies where id = any($1::uuid[]) and org_id = $2 and deleted_at is null",
                firmen, user.org_id,
            )
            if gefunden != len(firmen):
                raise HTTPException(409, "Eine der Firmen gibt es in dieser Organisation nicht.")
        if bereiche:
            gefunden = await conn.fetchval(
                "select count(*) from public.bereiche where id = any($1::uuid[]) and org_id = $2",
                bereiche, user.org_id,
            )
            if gefunden != len(bereiche):
                raise HTTPException(409, "Einen der Bereiche gibt es in dieser Organisation nicht.")

        await conn.execute(
            "update public.user_org_roles set sicht = $1 where user_id = $2 and org_id = $3",
            payload.sicht, mitglied_id, user.org_id,
        )
        await conn.execute(
            "delete from public.zugriffe where user_id = $1 and org_id = $2", mitglied_id, user.org_id
        )
        for z in payload.zugriffe:
            await conn.execute(
                "insert into public.zugriffe (org_id, user_id, company_id, bereich_id, stufe) "
                "values ($1, $2, $3, $4, $5)",
                user.org_id, mitglied_id, z.company_id, z.bereich_id, z.stufe,
            )
        await audit.log_fuer(
            conn, user, action="update", entity="users", entity_id=mitglied_id,
            diff={
                "sicht": payload.sicht,
                "zugriffe": [
                    {k: str(v) for k, v in z.model_dump(exclude={"name"}, exclude_none=True).items()}
                    for z in payload.zugriffe
                ],
            },
        )
        return await _sicht_lesen(conn, mitglied_id, user.org_id)


# ── Bereiche ─────────────────────────────────────────────────────────────


class BereichIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class BereichPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    position: int | None = None


class Bereich(BaseModel):
    id: UUID
    name: str
    position: int
    firmen: int = 0


_BEREICH_SPALTEN = """
    b.id, b.name, b.position,
    (select count(*) from public.companies c where c.bereich_id = b.id and c.deleted_at is null)::int as firmen
"""


@router.get("/api/bereiche", response_model=list[Bereich])
async def bereiche(user: CurrentUser = Depends(get_current_user)) -> list[Bereich]:
    """Die Namen sieht jede Person — wie die Namen der Firmen."""
    async with acquire_as(user.user_id) as conn:
        zeilen = await conn.fetch(
            f"select {_BEREICH_SPALTEN} from public.bereiche b where b.org_id = $1 "
            "order by b.position, lower(b.name)",
            user.org_id,
        )
    return [Bereich(**dict(z)) for z in zeilen]


@router.post("/api/bereiche", response_model=Bereich, status_code=201)
async def bereich_anlegen(payload: BereichIn, user: CurrentUser = Depends(verwaltet)) -> Bereich:
    async with acquire_as(user.user_id) as conn:
        try:
            zeile = await conn.fetchrow(
                """
                insert into public.bereiche (org_id, name, position)
                values ($1, $2, coalesce((select max(position) + 1 from public.bereiche where org_id = $1), 0))
                returning id, name, position
                """,
                user.org_id, payload.name.strip(),
            )
        except asyncpg.UniqueViolationError as e:
            raise HTTPException(409, f"„{payload.name.strip()}“ gibt es schon.") from e
        await audit.log_fuer(conn, user, action="create", entity="bereiche", entity_id=zeile["id"],
                             diff={"name": zeile["name"]})
    return Bereich(**dict(zeile))


@router.patch("/api/bereiche/{bereich_id}", response_model=Bereich)
async def bereich_aendern(
    bereich_id: UUID, payload: BereichPatch, user: CurrentUser = Depends(verwaltet)
) -> Bereich:
    felder = payload.model_dump(exclude_unset=True)
    if not felder:
        raise HTTPException(400, "Keine Änderung übergeben")
    async with acquire_as(user.user_id) as conn:
        try:
            zeile = await conn.fetchrow(
                f"""
                update public.bereiche b
                   set name = coalesce($2, b.name), position = coalesce($3, b.position)
                 where b.id = $1 and b.org_id = $4
                returning {_BEREICH_SPALTEN}
                """,
                bereich_id, (felder.get("name") or "").strip() or None, felder.get("position"), user.org_id,
            )
        except asyncpg.UniqueViolationError as e:
            raise HTTPException(409, "Diesen Namen gibt es schon.") from e
        if zeile is None:
            raise HTTPException(404, "Bereich nicht gefunden")
        await audit.log_fuer(conn, user, action="update", entity="bereiche", entity_id=bereich_id, diff=felder)
    return Bereich(**dict(zeile))


@router.delete("/api/bereiche/{bereich_id}", status_code=204)
async def bereich_loeschen(bereich_id: UUID, user: CurrentUser = Depends(verwaltet)) -> None:
    """Die Firmen bleiben, sie stehen danach in keinem Bereich. Zugriffe auf
    den Bereich fallen weg — wer nur über ihn sah, sieht danach nichts mehr
    davon. Das ist die vorsichtige Richtung."""
    async with acquire_as(user.user_id) as conn:
        weg = await conn.fetchval(
            "delete from public.bereiche where id = $1 and org_id = $2 returning id", bereich_id, user.org_id
        )
        if weg is None:
            raise HTTPException(404, "Bereich nicht gefunden")
        await audit.log_fuer(conn, user, action="delete", entity="bereiche", entity_id=bereich_id)


class FirmaBereich(BaseModel):
    bereich_id: UUID | None


@router.put("/api/companies/{company_id}/bereich", status_code=204)
async def firma_in_bereich(
    company_id: UUID, payload: FirmaBereich, user: CurrentUser = Depends(verwaltet)
) -> None:
    """Stellt eine Firma in einen Bereich (oder nimmt sie heraus). Nur wer
    verwaltet: Damit ändert sich, wer die Firma sieht."""
    async with acquire_as(user.user_id) as conn:
        if payload.bereich_id is not None:
            da = await conn.fetchval(
                "select true from public.bereiche where id = $1 and org_id = $2", payload.bereich_id, user.org_id
            )
            if not da:
                raise HTTPException(409, "Diesen Bereich gibt es in dieser Organisation nicht.")
        weg = await conn.fetchval(
            "update public.companies set bereich_id = $1 where id = $2 and org_id = $3 and deleted_at is null "
            "returning id",
            payload.bereich_id, company_id, user.org_id,
        )
        if weg is None:
            raise HTTPException(404, "Firma nicht gefunden")
        await audit.log_fuer(conn, user, action="update", entity="companies", entity_id=company_id,
                             diff={"bereich_id": str(payload.bereich_id) if payload.bereich_id else None})


# ── Beziehungen zwischen Kontakten ───────────────────────────────────────


class BeziehungIn(BaseModel):
    bezug_id: UUID
    art: str = Field(default="erziehungsberechtigt", min_length=1, max_length=60)


class Beziehung(BaseModel):
    id: UUID
    # Aus Sicht des abgefragten Kontakts: `bezug` ist die Bezugsperson
    # (der Elternteil), `fuer` der, für den er Bezugsperson ist (das Kind).
    richtung: Literal["bezug", "fuer"]
    contact_id: UUID
    name: str
    art: str


@router.get("/api/contacts/{contact_id}/beziehungen", response_model=list[Beziehung])
async def beziehungen(contact_id: UUID, user: CurrentUser = Depends(get_current_user)) -> list[Beziehung]:
    """Unter der Zeilensicherheit: Was die Person nicht sieht, fehlt einfach."""
    async with acquire_as(user.user_id) as conn:
        zeilen = await conn.fetch(
            """
            select b.id, 'bezug' as richtung, c.id as contact_id,
                   trim(concat_ws(' ', c.first_name, c.last_name)) as name, b.art
              from public.kontakt_beziehungen b join public.contacts c on c.id = b.bezug_id
             where b.kontakt_id = $1 and c.deleted_at is null
            union all
            select b.id, 'fuer', c.id, trim(concat_ws(' ', c.first_name, c.last_name)), b.art
              from public.kontakt_beziehungen b join public.contacts c on c.id = b.kontakt_id
             where b.bezug_id = $1 and c.deleted_at is null
            order by 2, 4
            """,
            contact_id,
        )
    return [Beziehung(**dict(z)) for z in zeilen]


@router.post("/api/contacts/{contact_id}/beziehungen", response_model=Beziehung, status_code=201)
async def beziehung_anlegen(
    contact_id: UUID, payload: BeziehungIn, user: CurrentUser = Depends(get_current_user)
) -> Beziehung:
    """Hängt eine Bezugsperson an einen Kontakt. Wer den Kontakt bearbeiten
    darf, darf das — die Datenbank prüft es (kontakt_beziehungen_schreiben)."""
    if payload.bezug_id == contact_id:
        raise HTTPException(400, "Ein Kontakt ist nicht seine eigene Bezugsperson.")
    async with acquire_as(user.user_id) as conn:
        beide = await conn.fetch(
            "select id, trim(concat_ws(' ', first_name, last_name)) as name from public.contacts "
            "where id = any($1::uuid[]) and org_id = $2 and deleted_at is null",
            [contact_id, payload.bezug_id], user.org_id,
        )
        namen = {z["id"]: z["name"] for z in beide}
        if contact_id not in namen or payload.bezug_id not in namen:
            raise HTTPException(404, "Kontakt nicht gefunden")
        try:
            neu = await conn.fetchval(
                "insert into public.kontakt_beziehungen (org_id, kontakt_id, bezug_id, art) "
                "values ($1, $2, $3, $4) returning id",
                user.org_id, contact_id, payload.bezug_id, payload.art.strip(),
            )
        except asyncpg.UniqueViolationError as e:
            raise HTTPException(409, "Diese Beziehung gibt es schon.") from e
        except asyncpg.InsufficientPrivilegeError as e:
            raise HTTPException(403, "Diesen Kontakt dürfen Sie nicht bearbeiten.") from e
        await audit.log_fuer(conn, user, action="create", entity="contacts", entity_id=contact_id,
                             diff={"beziehung": payload.art.strip(), "bezug_id": str(payload.bezug_id)})
    return Beziehung(id=neu, richtung="bezug", contact_id=payload.bezug_id,
                     name=namen[payload.bezug_id], art=payload.art.strip())


@router.delete("/api/contacts/{contact_id}/beziehungen/{beziehung_id}", status_code=204)
async def beziehung_loeschen(
    contact_id: UUID, beziehung_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> None:
    async with acquire_as(user.user_id) as conn:
        weg = await conn.fetchval(
            "delete from public.kontakt_beziehungen where id = $1 and $2 in (kontakt_id, bezug_id) returning id",
            beziehung_id, contact_id,
        )
        if weg is None:
            raise HTTPException(404, "Beziehung nicht gefunden")
        await audit.log_fuer(conn, user, action="delete", entity="contacts", entity_id=contact_id,
                             diff={"beziehung_id": str(beziehung_id)})
