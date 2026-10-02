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
from uuid import UUID, uuid4

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
    # Sieht vertrauliche Felder (seit 26.10.18). Fehlt er beim Setzen, bleibt
    # er, wie er war. Eigentümerin und Verwalter sehen sie immer.
    vertraulich_sehen: bool | None = None


async def _sicht_lesen(conn: asyncpg.Connection, user_id: UUID, org_id: UUID) -> Sicht:
    rolle = await conn.fetchrow(
        "select sicht, vertraulich_sehen, role::text as role from public.user_org_roles "
        "where user_id = $1 and org_id = $2",
        user_id, org_id,
    )
    if rolle is None:
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
    return Sicht(
        sicht=rolle["sicht"],
        zugriffe=[Zugriff(**dict(z)) for z in zeilen],
        vertraulich_sehen=rolle["vertraulich_sehen"] or rolle["role"] in ("owner", "admin"),
    )


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
            "update public.user_org_roles set sicht = $1, "
            "vertraulich_sehen = coalesce($4, vertraulich_sehen) where user_id = $2 and org_id = $3",
            payload.sicht, mitglied_id, user.org_id, payload.vertraulich_sehen,
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
                "vertraulich_sehen": payload.vertraulich_sehen,
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


class FirmaSichtPerson(BaseModel):
    user_id: UUID
    name: str
    # Wodurch: `alles` (volle Sicht), `firma` (Zugriff auf diese Firma) oder
    # `bereich` (über ihren Bereich).
    ueber: Literal["alles", "firma", "bereich"]
    stufe: Literal["lesen", "bearbeiten"]


class FirmaSicht(BaseModel):
    bereich_id: UUID | None
    personen: list[FirmaSichtPerson]


@router.get("/api/companies/{company_id}/sicht", response_model=FirmaSicht)
async def firma_sicht(company_id: UUID, user: CurrentUser = Depends(verwaltet)) -> FirmaSicht:
    """Wer sieht diese Firma mit ihren Kontakten — für die Leitung.

    Die Namen der Firma sieht jede Person; hier stehen nur die, die auch
    ihre Kontakte sehen: alle mit voller Sicht, dazu die Eingeschränkten mit
    Zugriff auf die Firma oder ihren Bereich.
    """
    async with acquire_as(user.user_id) as conn:
        bereich = await conn.fetchrow(
            "select bereich_id from public.companies where id = $1 and org_id = $2 and deleted_at is null",
            company_id, user.org_id,
        )
        if bereich is None:
            raise HTTPException(404, "Firma nicht gefunden")
        zeilen = await conn.fetch(
            """
            select u.id as user_id, coalesce(u.display_name, u.olares_username) as name,
                   'alles' as ueber, case when r.role = 'viewer' then 'lesen' else 'bearbeiten' end as stufe
              from public.user_org_roles r join public.users u on u.id = r.user_id
             where r.org_id = $1 and r.sicht = 'alles' and u.deleted_at is null
            union all
            select u.id, coalesce(u.display_name, u.olares_username),
                   case when z.company_id is not null then 'firma' else 'bereich' end, z.stufe
              from public.zugriffe z
              join public.user_org_roles r on r.user_id = z.user_id and r.org_id = z.org_id
              join public.users u on u.id = z.user_id
             where z.org_id = $1 and r.sicht = 'eingeschraenkt' and u.deleted_at is null
               and (z.company_id = $2 or (z.bereich_id is not null and z.bereich_id = $3))
             order by 3, 2
            """,
            user.org_id, company_id, bereich["bereich_id"],
        )
    return FirmaSicht(
        bereich_id=bereich["bereich_id"],
        personen=[FirmaSichtPerson(**dict(z)) for z in zeilen],
    )


# ── Beziehungen zwischen Kontakten ───────────────────────────────────────


class NeueBezugsperson(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=60)


class BeziehungIn(BaseModel):
    """Eine vorhandene Bezugsperson (`bezug_id`) oder eine neue (`neu`)."""

    bezug_id: UUID | None = None
    neu: NeueBezugsperson | None = None
    art: str = Field(default="erziehungsberechtigt", min_length=1, max_length=60)

    @model_validator(mode="after")
    def _eines(self) -> "BeziehungIn":
        if (self.bezug_id is None) == (self.neu is None):
            raise ValueError("Genau eines: bezug_id oder neu.")
        return self


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
    art = payload.art.strip()
    async with acquire_as(user.user_id) as conn, conn.transaction():
        kind = await conn.fetchval(
            "select trim(concat_ws(' ', first_name, last_name)) from public.contacts "
            "where id = $1 and org_id = $2 and deleted_at is null",
            contact_id, user.org_id,
        )
        if kind is None:
            raise HTTPException(404, "Kontakt nicht gefunden")
        if payload.neu is not None:
            # Neu und gleich verknüpft, in einem Zug. Ein Kontakt ohne Firma ist
            # für eine eingeschränkte Person erst sichtbar, wenn er am Kind
            # hängt — darum ohne `returning` angelegt, mit selbst gewählter
            # Kennung (siehe contacts_sicht_anlegen in 0037).
            bezug_id = uuid4()
            n = payload.neu
            name = " ".join(x for x in ((n.first_name or "").strip(), n.last_name.strip()) if x)
            await conn.execute(
                "insert into public.contacts (id, org_id, first_name, last_name, email, phone, owner_id, created_by) "
                "values ($1, $2, $3, $4, $5, $6, $7, $7)",
                bezug_id, user.org_id, (n.first_name or "").strip() or None, n.last_name.strip(),
                (n.email or "").strip() or None, (n.phone or "").strip() or None, user.handelnder,
            )
            await audit.log_fuer(conn, user, action="create", entity="contacts", entity_id=bezug_id,
                                 diff={"name": name, "bezugsperson_fuer": str(contact_id)})
        else:
            bezug_id = payload.bezug_id
            name = await conn.fetchval(
                "select trim(concat_ws(' ', first_name, last_name)) from public.contacts "
                "where id = $1 and org_id = $2 and deleted_at is null",
                bezug_id, user.org_id,
            )
            if name is None:
                raise HTTPException(404, "Kontakt nicht gefunden")
        try:
            async with conn.transaction():
                neu = await conn.fetchval(
                    "insert into public.kontakt_beziehungen (org_id, kontakt_id, bezug_id, art) "
                    "values ($1, $2, $3, $4) returning id",
                    user.org_id, contact_id, bezug_id, art,
                )
        except asyncpg.UniqueViolationError as e:
            raise HTTPException(409, "Diese Beziehung gibt es schon.") from e
        except asyncpg.InsufficientPrivilegeError as e:
            raise HTTPException(403, "Diesen Kontakt dürfen Sie nicht bearbeiten.") from e
        await audit.log_fuer(conn, user, action="create", entity="contacts", entity_id=contact_id,
                             diff={"beziehung": art, "bezug_id": str(bezug_id)})
    return Beziehung(id=neu, richtung="bezug", contact_id=bezug_id, name=name, art=art)


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
