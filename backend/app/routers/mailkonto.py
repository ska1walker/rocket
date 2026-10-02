"""Mein Postfach (seit 26.10.20, Stufe 2 aus docs/PLAN-TEAM.md).

Jede Person verbindet **ihr eigenes** Postfach; der Pfad kennt keine
Kennung, nur „wer gerade handelt“ — es gibt keinen Weg, das Postfach einer
anderen Person zu lesen oder zu ändern, auch nicht als Verwalter. Die
Datenbank sagt dasselbe (`mailkonten_eigen` in 0041).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import audit, mailanbieter, mailkonten, tresor
from app.auth import CurrentUser, get_current_user
from app.db import acquire_as

router = APIRouter(prefix="/api/mailkonto", tags=["mailkonto"])


class Mailkonto(BaseModel):
    id: UUID
    anbieter: str
    adresse: str
    absender_name: str | None = None
    benutzer: str
    # Nie das Passwort, nur ob eines liegt.
    passwort_gesetzt: bool
    imap_host: str
    imap_port: int
    smtp_host: str | None = None
    smtp_port: int
    smtp_sicherheit: str
    ordner_ein: str
    ordner_aus: str | None = None
    aktiv: bool
    zuletzt: datetime | None = None
    letzter_fehler: str | None = None
    eingelesen: int


class MailkontoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    anbieter: str = mailanbieter.EIGEN
    adresse: str = Field(min_length=3, max_length=200)
    absender_name: str | None = Field(default=None, max_length=120)
    benutzer: str | None = Field(default=None, max_length=200)
    # `null` lässt ein hinterlegtes stehen; beim ersten Speichern Pflicht.
    passwort: str | None = Field(default=None, max_length=500)
    imap_host: str | None = Field(default=None, max_length=200)
    imap_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_host: str | None = Field(default=None, max_length=200)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_sicherheit: Literal["ssl", "starttls"] | None = None
    ordner_ein: str | None = Field(default=None, max_length=200)
    ordner_aus: str | None = Field(default=None, max_length=200)
    aktiv: bool = True


_SPALTEN = (
    "id, anbieter, adresse, absender_name, benutzer, passwort is not null as passwort_gesetzt, "
    "imap_host, imap_port, smtp_host, smtp_port, smtp_sicherheit, ordner_ein, ordner_aus, aktiv, "
    "zuletzt, letzter_fehler, eingelesen"
)


async def _eigenes(conn, org_id: UUID) -> dict | None:
    z = await conn.fetchrow(f"select {_SPALTEN} from public.mailkonten where org_id = $1", org_id)  # noqa: S608
    return dict(z) if z else None


@router.get("/anbieter")
async def anbieter(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {"anbieter": mailanbieter.als_liste(), "microsoft": mailanbieter.MICROSOFT_SATZ}


@router.get("", response_model=Mailkonto | None)
async def lesen(user: CurrentUser = Depends(get_current_user)) -> Mailkonto | None:
    async with acquire_as(user.user_id) as conn:
        z = await _eigenes(conn, user.org_id)
    return Mailkonto(**z) if z else None


@router.put("", response_model=Mailkonto)
async def speichern(payload: MailkontoIn, user: CurrentUser = Depends(get_current_user)) -> Mailkonto:
    """Verbindet das eigene Postfach oder ändert es.

    Eine Voreinstellung füllt, was die Anfrage offenlässt; was die Person
    selbst einträgt, gilt. Ändern sich Server, Benutzer oder Adresse, beginnt
    das Lesen neu (die gemerkten UIDs gehörten zu einem anderen Postfach).
    """
    vorlage = mailanbieter.nach_schluessel(payload.anbieter)
    if payload.anbieter != mailanbieter.EIGEN and vorlage is None:
        raise HTTPException(422, "Diesen Anbieter kennt Rocket nicht.")
    adresse = payload.adresse.strip().lower()
    if "@" not in adresse:
        raise HTTPException(422, "Das ist keine E-Mail-Adresse.")
    imap_host = (payload.imap_host or (vorlage.imap_host if vorlage else "")).strip()
    smtp_host = (payload.smtp_host or (vorlage.smtp_host if vorlage else "")).strip() or None
    if not imap_host:
        raise HTTPException(422, "Ohne IMAP-Server lässt sich nichts lesen.")
    if mailanbieter.ist_microsoft(imap_host) or mailanbieter.ist_microsoft(smtp_host):
        raise HTTPException(422, mailanbieter.MICROSOFT_SATZ)
    werte = {
        "anbieter": payload.anbieter,
        "adresse": adresse,
        "absender_name": (payload.absender_name or "").strip() or None,
        "benutzer": (payload.benutzer or "").strip() or adresse,
        "imap_host": imap_host,
        "imap_port": payload.imap_port or (vorlage.imap_port if vorlage else 993),
        "smtp_host": smtp_host,
        "smtp_port": payload.smtp_port or (vorlage.smtp_port if vorlage else 465),
        "smtp_sicherheit": payload.smtp_sicherheit or (vorlage.smtp_sicherheit if vorlage else "ssl"),
        "ordner_ein": (payload.ordner_ein or "").strip() or "INBOX",
        "ordner_aus": (payload.ordner_aus or "").strip() or None,
        "aktiv": payload.aktiv,
    }
    async with acquire_as(user.user_id) as conn:
        vorher = await conn.fetchrow("select * from public.mailkonten where org_id = $1", user.org_id)
        if vorher is None and not payload.passwort:
            raise HTTPException(422, "Beim Verbinden braucht es das Passwort des Postfachs.")
        neu_lesen = vorher is None or any(
            vorher[k] != werte[k] for k in ("adresse", "benutzer", "imap_host", "imap_port", "ordner_ein")
        )
        passwort = tresor.verschluesseln(payload.passwort) if payload.passwort else (vorher["passwort"] if vorher else None)
        spalten = list(werte)
        if vorher is None:
            await conn.execute(
                f"insert into public.mailkonten (org_id, user_id, passwort, {', '.join(spalten)}) "  # noqa: S608
                f"values ($1, $2, $3, {', '.join(f'${i + 4}' for i in range(len(spalten)))})",
                user.org_id, user.user_id, passwort, *werte.values(),
            )
        else:
            zurueck = ", uid_ein = null, uidv_ein = null, uid_aus = null, uidv_aus = null" if neu_lesen else ""
            await conn.execute(
                f"update public.mailkonten set passwort = $2, updated_at = now(), letzter_fehler = null, "  # noqa: S608
                f"{', '.join(f'{k} = ${i + 3}' for i, k in enumerate(spalten))}{zurueck} where id = $1",
                vorher["id"], passwort, *werte.values(),
            )
        await audit.log_fuer(
            conn, user, action="update", entity="mailkonten", entity_id=None,
            diff={"postfach": adresse, "anbieter": payload.anbieter},
        )
        z = await _eigenes(conn, user.org_id)
    return Mailkonto(**z)


@router.delete("", status_code=204)
async def trennen(user: CurrentUser = Depends(get_current_user)) -> None:
    """Trennt das Postfach. Was schon im Verlauf steht, bleibt."""
    async with acquire_as(user.user_id) as conn:
        await conn.execute("delete from public.mailkonten where org_id = $1", user.org_id)
        await audit.log_fuer(conn, user, action="delete", entity="mailkonten", entity_id=None)


async def _konto(user: CurrentUser):
    async with acquire_as(user.user_id) as conn:
        z = await conn.fetchrow("select * from public.mailkonten where org_id = $1", user.org_id)
    if z is None:
        raise HTTPException(404, "Noch kein Postfach verbunden.")
    return z


@router.post("/testen")
async def testen(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Meldet sich an IMAP und SMTP an — liest und sendet nichts."""
    ergebnis = await mailkonten.pruefen(mailkonten.Konto.aus_zeile(await _konto(user)))
    return {**ergebnis, "ok": ergebnis["imap"] is None and ergebnis["smtp"] is None}


@router.post("/abholen")
async def abholen(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Liest jetzt, statt auf den nächsten Takt zu warten."""
    z = await _konto(user)
    try:
        async with acquire_as(user.user_id) as conn:
            return await mailkonten.einlesen(conn, z)
    except Exception as exc:
        async with acquire_as(user.user_id) as conn:
            await mailkonten.fehler_merken(conn, z["id"], exc)
        raise HTTPException(502, f"Abholen fehlgeschlagen: {mailkonten._fehlertext(exc)}") from exc
