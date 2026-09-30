"""Anmelden, abmelden, Passwort setzen — der einzige Weg herein.

Der Keks trägt alles und ist für JavaScript unsichtbar (`HttpOnly`).
Damit kann kein eingeschleustes Skript die Sitzung stehlen, und es gibt
kein Token im `localStorage`, das ein Werbeblocker-Add-on mitlesen könnte.

`SameSite=Lax` ist der CSRF-Schutz: Ein Formular auf einer fremden Seite
darf den Keks bei einem POST nicht mitschicken. Zusätzlich wird der
`Origin` geprüft, wo er ankommt — Gürtel und Hosenträger, beides billig.
"""

import asyncio
import logging
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app import anmeldung as kern
from app import audit, tresor, versand, zuruecksetzen
from app import zweiterfaktor as zf
from app.auth import CurrentUser, get_current_user, verwaltet
from app.config import settings
from app.db import acquire, acquire_as

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["anmeldung"])


class Zugangsdaten(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    passwort: str = Field(min_length=1, max_length=200)


class Passwortwechsel(BaseModel):
    alt: str = Field(min_length=1, max_length=200)
    neu: str = Field(min_length=1, max_length=200)


class Einloesung(BaseModel):
    passwort: str = Field(min_length=1, max_length=200)


class Vergessen(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class Ruecksetzung(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=100)
    passwort: str = Field(min_length=1, max_length=200)


class Ablageort(BaseModel):
    """Wo die Datei liegt. Kein Geheimnis — der Weg dorthin ist eines."""

    # Der Klickweg in der Dateien-App. `pfad` war früher der Pfad im
    # Container, und den gibt es in der Dateien-App nicht.
    ordner: str
    minuten: int


class Lage(BaseModel):
    angemeldet: bool
    name: str | None = None
    modus: str
    # Passwort stimmt, der Code aus der App steht noch aus.
    zweiter_faktor: bool = False


class Code(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class Abschalten(BaseModel):
    passwort: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=40)


class Pflicht(BaseModel):
    an: bool


class FaktorStand(BaseModel):
    aktiv: bool
    seit: datetime | None = None
    codes_uebrig: int = 0
    # Verlangt die Organisation den Faktor? Dann lässt er sich nicht abschalten.
    pflicht: bool = False


class Einrichtung(BaseModel):
    """Einmal gezeigt: das Geheimnis zum Abtippen und derselbe Inhalt als QR."""

    geheimnis: str
    uri: str
    qr_svg: str


class Codes(BaseModel):
    """Die Wiederherstellungscodes — nur in dieser einen Antwort im Klartext."""

    codes: list[str]


def _adresse(request: Request) -> str:
    """Die Adresse des Anfragenden — für die Bremse, nicht für Rechte.

    Hinter dem Envoy und dem Next-Proxy steht die echte Adresse in
    `X-Forwarded-For`. Der Wert ist fälschbar; für eine Bremse ist das
    hinnehmbar, für eine Entscheidung über Zugang wäre es das nicht.
    """
    weiter = request.headers.get("x-forwarded-for", "")
    if weiter:
        return weiter.split(",")[0].strip()[:100]
    return request.client.host if request.client else "unbekannt"


def _herkunft_pruefen(request: Request) -> None:
    """Weist einen schreibenden Aufruf von einer fremden Seite ab.

    `SameSite=Lax` hält das meiste schon vom Browser fern; diese Prüfung
    fängt den Rest und kostet nichts. Fehlt der Kopf ganz (etwa bei einem
    Aufruf ohne Browser), wird nicht abgewiesen — sonst wäre jedes Skript
    ausgesperrt, das legitim mit Zugangsdaten arbeitet.
    """
    herkunft = request.headers.get("origin")
    if not herkunft:
        return
    # Der Browser spricht mit dem Frontend, das Frontend leitet weiter.
    # Im `Host` steht deshalb der interne Dienst (`localhost:8010`, auf der
    # Box der Service-Name), nicht die Adresse, die der Mensch sieht — der
    # Vergleich gegen `Host` allein wies jede echte Anmeldung ab. Was der
    # Browser sah, steht in `X-Forwarded-Host`; den setzt der Proxy.
    ziele = {
        request.headers.get("x-forwarded-host", ""),
        request.headers.get("host", ""),
    }
    ziele.discard("")
    if ziele and not any(herkunft.endswith(f"//{z}") for z in ziele):
        raise HTTPException(403, "Diese Anfrage kommt von einer fremden Seite.")


def _ueber_tls(request: Request) -> bool:
    """Kam diese Anfrage verschlüsselt herein?

    Das entscheidet über `Secure` — und zwar an der **Verbindung**, nicht
    am Modus. Am Modus festgemacht trüge der Keks auf der Box im Betrieb
    `olares` kein `Secure`, obwohl dort alles über TLS läuft; und lokal
    ohne TLS verwürfe der Browser einen `Secure`-Keks stillschweigend, was
    wie ein kaputtes Anmelden aussieht. Hinter dem Proxy steht das Schema
    des Browsers in `X-Forwarded-Proto`.
    """
    weiter = request.headers.get("x-forwarded-proto", "")
    if weiter:
        return weiter.split(",")[0].strip() == "https"
    return request.url.scheme == "https"


def _keks_setzen(request: Request, antwort: Response, token: str) -> None:
    antwort.set_cookie(
        kern.KEKS,
        token,
        max_age=settings.sitzung_tage * 86400,
        httponly=True,
        secure=_ueber_tls(request),
        samesite="lax",
        path="/",
    )


def _vorstufe_setzen(request: Request, antwort: Response, token: str) -> None:
    antwort.set_cookie(
        kern.VORSTUFE_KEKS,
        token,
        max_age=kern.VORSTUFE_MINUTEN * 60,
        httponly=True,
        secure=_ueber_tls(request),
        samesite="lax",
        path="/api/anmeldung",
    )


async def _protokoll(
    user_id: UUID, org_id: UUID, action: str, login: str | None, diff: dict[str, Any] | None = None
) -> None:
    """Hält eine Anmeldung fest — Erfolg, Fehlversuch, zweiter Faktor,
    Abmeldung. Mit dem Kontext der betroffenen Person, sonst dürfte die
    Zeile nicht in ihre Organisation. Ein unbekannter Name hat keine
    Organisation und bleibt deshalb ungeschrieben; die Bremse zählt ihn
    trotzdem."""
    async with acquire_as(user_id) as conn:
        await audit.log(
            conn, org_id=org_id, actor_id=user_id, action=action,
            entity="anmeldung", entity_id=user_id, diff=diff, actor_login=login,
        )


@router.get("/anmeldung/lage", response_model=Lage)
async def lage(request: Request) -> Lage:
    """Sagt der Oberfläche, ob jemand angemeldet ist. Verrät sonst nichts."""
    keks = request.cookies.get(kern.KEKS)
    vorstufe = request.cookies.get(kern.VORSTUFE_KEKS)
    async with acquire() as conn:
        sitzung = await kern.sitzung_lesen(conn, keks) if keks else None
        if sitzung is None:
            offen = await kern.vorstufe_lesen(conn, vorstufe) if vorstufe else None
            return Lage(angemeldet=False, modus=settings.anmeldung_modus, zweiter_faktor=offen is not None)
        name = await conn.fetchval("select display_name from public.users where id = $1", sitzung.user_id)
    return Lage(angemeldet=True, name=name, modus=settings.anmeldung_modus)


@router.post("/anmeldung", response_model=Lage)
async def anmelden(
    daten: Zugangsdaten,
    request: Request,
    antwort: Response,
    user_agent: Annotated[str | None, Header()] = None,
) -> Lage:
    _herkunft_pruefen(request)
    name = daten.name.strip()
    async with acquire() as conn:
        try:
            ergebnis = await kern.anmelden(conn, daten.name, daten.passwort, user_agent or "", _adresse(request))
        except kern.ZuVieleVersuche as exc:
            raise HTTPException(
                429,
                "Zu viele Versuche. Bitte warten Sie eine Viertelstunde.",
                headers={"Retry-After": str(exc.sekunden)},
            ) from exc
        except kern.Anmeldefehler as exc:
            if exc.user_id and exc.org_id:
                await _protokoll(exc.user_id, exc.org_id, "anmeldung_abgewiesen", name, {"grund": "passwort"})
            # Immer dieselbe Meldung: Ob es den Namen gibt, geht niemanden an.
            raise HTTPException(401, "Name oder Passwort stimmt nicht.") from exc
    if ergebnis.vorstufe:
        _vorstufe_setzen(request, antwort, ergebnis.token)
        return Lage(angemeldet=False, name=None, modus=settings.anmeldung_modus, zweiter_faktor=True)
    await _protokoll(ergebnis.user_id, ergebnis.org_id, "anmeldung", name, {"zweiter_faktor": False})
    _keks_setzen(request, antwort, ergebnis.token)
    return Lage(angemeldet=True, name=daten.name, modus=settings.anmeldung_modus)


@router.post("/anmeldung/code", response_model=Lage)
async def code_einloesen(
    daten: Code,
    request: Request,
    antwort: Response,
    user_agent: Annotated[str | None, Header()] = None,
) -> Lage:
    """Der zweite Schritt: Code aus der App oder ein Wiederherstellungscode.

    Die Vorstufe wird danach beendet und eine **neue** Sitzung angelegt —
    nicht die Vorstufe hochgestuft. So kann ein Token, das vor dem Code
    irgendwo sichtbar war, nachher nichts mehr.
    """
    _herkunft_pruefen(request)
    vorstufe = request.cookies.get(kern.VORSTUFE_KEKS)
    if not vorstufe:
        raise HTTPException(401, "Bitte melden Sie sich zuerst mit Name und Passwort an.")
    async with acquire() as conn:
        offen = await kern.vorstufe_lesen(conn, vorstufe)
        if offen is None:
            raise HTTPException(401, "Die Anmeldung ist abgelaufen. Bitte noch einmal mit Name und Passwort.")
        name = await conn.fetchval("select olares_username from public.users where id = $1", offen.user_id)
        kennungen = [f"name:{(name or '').lower()}", f"ip:{_adresse(request)}"]
        try:
            await kern.bremse_pruefen(conn, kennungen)
        except kern.ZuVieleVersuche as exc:
            raise HTTPException(
                429,
                "Zu viele Versuche. Bitte warten Sie eine Viertelstunde.",
                headers={"Retry-After": str(exc.sekunden)},
            ) from exc
        art = await kern.zweiter_faktor_pruefen(conn, offen.user_id, daten.code)
        if art is None:
            await kern.versuch_merken(conn, kennungen)
            await _protokoll(offen.user_id, offen.org_id, "anmeldung_abgewiesen", name, {"grund": "code"})
            raise HTTPException(401, "Der Code stimmt nicht.")
        await kern.sitzung_beenden(conn, vorstufe)
        await kern.versuche_loeschen(conn, kennungen)
        token = await kern.sitzung_anlegen(conn, offen.user_id, offen.org_id, user_agent or "")
        uebrig = None
        if art == "wiederherstellung":
            async with conn.transaction():
                await conn.execute("select set_config('app.zweitfaktor_fuer', $1, true)", str(offen.user_id))
                uebrig = await conn.fetchval(
                    "select count(*) from public.zweitfaktor_codes where user_id = $1 and benutzt_am is null",
                    offen.user_id,
                )
    await _protokoll(
        offen.user_id, offen.org_id, "anmeldung", name,
        {"zweiter_faktor": art, **({"codes_uebrig": uebrig} if uebrig is not None else {})},
    )
    antwort.delete_cookie(kern.VORSTUFE_KEKS, path="/api/anmeldung")
    _keks_setzen(request, antwort, token)
    return Lage(angemeldet=True, name=name, modus=settings.anmeldung_modus)


@router.post("/abmeldung", status_code=204)
async def abmelden(request: Request, antwort: Response) -> Response:
    """Beendet die Sitzung **auf dem Server**. Ein bloß gelöschter Keks
    wäre kein Abmelden: Das Token bliebe gültig, bis es abläuft."""
    keks = request.cookies.get(kern.KEKS)
    if keks:
        async with acquire() as conn:
            sitzung = await kern.sitzung_lesen(conn, keks)
            await kern.sitzung_beenden(conn, keks)
            name = (
                await conn.fetchval("select olares_username from public.users where id = $1", sitzung.user_id)
                if sitzung else None
            )
        if sitzung:
            await _protokoll(sitzung.user_id, sitzung.org_id, "abmeldung", name)
    antwort.delete_cookie(kern.KEKS, path="/")
    antwort.delete_cookie(kern.VORSTUFE_KEKS, path="/api/anmeldung")
    return Response(status_code=204, headers=dict(antwort.headers))


@router.post("/anmeldung/passwort", status_code=204)
async def passwort_aendern(
    daten: Passwortwechsel,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Das eigene Passwort ändern. Das alte wird verlangt — sonst genügte
    ein fremder, offener Browser, um jemanden auszusperren."""
    _herkunft_pruefen(request)
    try:
        kern.passwort_pruefen(daten.neu)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    # Mit Nutzerkontext: Die Zeilensicherheit auf `sitzungen` gibt über
    # `sitzungen_selbst` nur die eigenen frei — und genau die sollen
    # unten beendet werden.
    async with acquire_as(user.user_id) as conn:
        hash_wert = await conn.fetchval("select passwort_hash from public.users where id = $1", user.user_id)
        # Wer noch keines hat, setzt sein erstes — dann gibt es nichts zu prüfen.
        if hash_wert and not kern.passwort_stimmt(hash_wert, daten.alt):
            raise HTTPException(403, "Das bisherige Passwort stimmt nicht.")
        await conn.execute(
            "update public.users set passwort_hash = $1, passwort_am = now() where id = $2",
            kern.hash_passwort(daten.neu), user.user_id,
        )
        # Alle anderen Sitzungen beenden: Ein Passwortwechsel ist oft die
        # Reaktion auf einen Verdacht, und dann muss er alle Geräte treffen.
        keks = request.cookies.get(kern.KEKS)
        await conn.execute(
            "update public.sitzungen set beendet_am = now() "
            "where user_id = $1 and beendet_am is null and token_hash <> $2",
            user.user_id, kern.token_hash(keks) if keks else "",
        )
    return Response(status_code=204)


@router.post("/anmeldung/vergessen", response_model=Ablageort)
async def vergessen(
    daten: Vergessen, request: Request
) -> Ablageort:
    """Legt einen Rücksetzcode in den Datenordner der App.

    Die Antwort ist **immer dieselbe**, ob es den Zugang gibt oder nicht.
    Sonst wäre dieser Endpunkt das Namensverzeichnis, das die
    Anmeldemaske selbst sorgfältig verschweigt.

    Geschrieben wird nur für einen Zugang, der schon ein Passwort hat: Wer
    noch keines gesetzt hat, kommt auf einer frischen Box ohnehin über die
    Box-Sitzung herein und braucht diesen Weg nicht.
    """
    _herkunft_pruefen(request)
    kennungen = [f"name:{daten.name.strip().lower()}", f"ip:{_adresse(request)}"]
    async with acquire() as conn:
        try:
            await kern.bremse_pruefen(conn, kennungen)
        except kern.ZuVieleVersuche as exc:
            raise HTTPException(
                429,
                "Zu viele Versuche. Bitte warten Sie eine Viertelstunde.",
                headers={"Retry-After": str(exc.sekunden)},
            ) from exc
        # Alle Zugänge mit Passwort — sie kommen in die Datei, nicht in die
        # Antwort. Auf einer fremden Box weiß der Mensch oft nicht, wie
        # sein Zugang heißt; wer die Datei öffnen kann, darf es erfahren.
        # Nur Zugänge, die eine Zurücksetzung auch wirklich wieder
        # hereinlässt: mit Passwort, nicht gelöscht, und **in einer
        # Organisation**. Ohne die letzte Bedingung nennte die Datei Namen,
        # bei denen der Code später doch abgewiesen wird.
        zeilen = await conn.fetch(
            "select u.olares_username from public.users u "
            "join public.user_org_roles r on r.user_id = u.id "
            "where u.deleted_at is null and u.passwort_hash is not null "
            "order by u.created_at"
        )
        zugaenge = [z["olares_username"] for z in zeilen]
        gibt_es = any(z.lower() == daten.name.strip().lower() for z in zugaenge)
        # Dieselbe Frage, die `auth._noch_unbewohnt()` stellt: Steht
        # irgendwo ein Passwort? Nur wenn nirgends eines steht, lässt die
        # Anwendung die Olares-Sitzung noch durch.
        passwoerter_ueberhaupt = await conn.fetchval(
            "select exists(select 1 from public.users where passwort_hash is not null)"
        )
        # Der Versuch zählt in jedem Fall. Zählte er nur beim Treffer,
        # ließe sich an der Bremse ablesen, welche Namen es gibt.
        await kern.versuch_merken(conn, kennungen)
    zuruecksetzen.anfordern(
        daten.name.strip(), zugaenge,
        bekannt=gibt_es, passwoerter_ueberhaupt=bool(passwoerter_ueberhaupt),
    )
    # Zusätzlich per Mail, wo das geht — immer angestoßen, damit Antwort
    # und Dauer nicht verraten, ob es den Namen gibt.
    _im_hintergrund(_mail_code_schicken(daten.name.strip()))
    return Ablageort(
        ordner=zuruecksetzen.wo_liegt_die_datei(), minuten=zuruecksetzen.GUELTIG_MINUTEN
    )


@router.post("/anmeldung/zuruecksetzen", response_model=Lage)
async def zuruecksetzen_einloesen(
    daten: Ruecksetzung,
    request: Request,
    antwort: Response,
    user_agent: Annotated[str | None, Header()] = None,
) -> Lage:
    """Setzt mit dem Code aus der Datei ein neues Passwort.

    Danach ist die Datei weg und **jede** offene Sitzung beendet: Wer sein
    Passwort zurücksetzt, tut das oft, weil etwas nicht stimmt.
    """
    _herkunft_pruefen(request)
    try:
        kern.passwort_pruefen(daten.passwort)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    kennungen = [f"name:{daten.name.strip().lower()}", f"ip:{_adresse(request)}"]
    async with acquire() as conn:
        try:
            await kern.bremse_pruefen(conn, kennungen)
        except kern.ZuVieleVersuche as exc:
            raise HTTPException(
                429,
                "Zu viele Versuche. Bitte warten Sie eine Viertelstunde.",
                headers={"Retry-After": str(exc.sekunden)},
            ) from exc

        zeile = await conn.fetchrow(
            """
            select u.id, r.org_id
              from public.users u
              left join public.user_org_roles r on r.user_id = u.id
             where lower(u.olares_username) = lower($1) and u.deleted_at is null
             order by r.joined_at
             limit 1
            """,
            daten.name.strip(),
        )

        # Zwei Wege, und sie unterscheiden sich im zweiten Faktor:
        # - **Datei auf der Box**: Wer sie öffnen kann, verfügt ohnehin über
        #   die Box. Der Weg setzt den zweiten Faktor mit zurück — er ist
        #   die Rettung, wenn Handy und Wiederherstellungscodes weg sind.
        # - **Mail**: Wer nur das Postfach hat, hat nicht das Handy. Der
        #   zweite Faktor bleibt und wird nach dem neuen Passwort verlangt.
        weg = None
        if zuruecksetzen.stimmt(daten.name, daten.code):
            weg = "datei"
        elif zeile is not None:
            async with conn.transaction():
                hash_wert = kern.token_hash(_code_normal(daten.code))
                await conn.execute("select set_config('app.anmelde_token', $1, true)", hash_wert)
                getroffen = await conn.fetchval(
                    "update public.passwort_links set benutzt_am = now() "
                    "where token_hash = $1 and user_id = $2 and benutzt_am is null and laeuft_ab > now() "
                    "returning id",
                    hash_wert, zeile["id"],
                )
            if getroffen:
                weg = "mail"
        if weg is None or zeile is None or zeile["org_id"] is None:
            await kern.versuch_merken(conn, kennungen)
            raise HTTPException(403, "Der Code stimmt nicht oder ist abgelaufen.")

        await conn.execute(
            "update public.users set passwort_hash = $1, passwort_am = now(), "
            "gesperrt_bis = null where id = $2",
            kern.hash_passwort(daten.passwort), zeile["id"],
        )
        await conn.execute(
            "update public.sitzungen set beendet_am = now() "
            "where user_id = $1 and beendet_am is null",
            zeile["id"],
        )
        if weg == "datei":
            await kern.zweiter_faktor_zuruecksetzen(conn, zeile["id"])
        mit_faktor = await kern.zweiter_faktor_aktiv(conn, zeile["id"])
        if not mit_faktor:
            await kern.versuche_loeschen(conn, kennungen)
        token = await kern.sitzung_anlegen(conn, zeile["id"], zeile["org_id"], user_agent or "", vorstufe=mit_faktor)

    if weg == "datei":
        zuruecksetzen.verbrauchen()
    await _protokoll(
        zeile["id"], zeile["org_id"], "passwort_zurueckgesetzt", daten.name.strip(),
        {"weg": weg, "zweiter_faktor_zurueckgesetzt": weg == "datei"},
    )
    if mit_faktor:
        _vorstufe_setzen(request, antwort, token)
        return Lage(angemeldet=False, modus=settings.anmeldung_modus, zweiter_faktor=True)
    _keks_setzen(request, antwort, token)
    return Lage(angemeldet=True, name=daten.name, modus=settings.anmeldung_modus)


@router.get("/einladung/{token}")
async def einladung_ansehen(token: str) -> dict:
    """Zeigt nur, für wen die Einladung gilt — und ob sie noch gilt.

    `uebernahme` ist der Fall, der eine Warnung verdient: Das Konto hat
    schon ein Passwort, und Einlösen **ersetzt** es. Für einen Eigentümer,
    der jemandem den Zugang zurücksetzt, ist das richtig. Wer den Link
    versehentlich bekommt, sperrt damit aber den bisherigen Inhaber aus —
    genau daran wäre am 8. September fast jemand hängengeblieben, weil der
    Anzeigename und die Kennung auf verschiedene Menschen zeigten.
    """
    async with acquire() as conn:
        row = await kern.einladung_lesen(conn, token)
    if row is None:
        raise HTTPException(404, "Diese Einladung gilt nicht mehr.")
    return {
        "name": row["display_name"] or row["olares_username"],
        "kennung": row["olares_username"],
        "uebernahme": bool(row["hat_passwort"]),
    }


@router.post("/einladung/{token}", response_model=Lage)
async def einladung_einloesen(
    token: str,
    daten: Einloesung,
    request: Request,
    antwort: Response,
    user_agent: Annotated[str | None, Header()] = None,
) -> Lage:
    """Passwort setzen und gleich angemeldet sein. Der Link ist danach tot."""
    _herkunft_pruefen(request)
    async with acquire() as conn:
        try:
            user_id = await kern.einladung_einloesen(conn, token, daten.passwort)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except kern.Anmeldefehler as exc:
            raise HTTPException(404, str(exc)) from exc
        zeile = await conn.fetchrow(
            "select u.olares_username, u.display_name, r.org_id from public.users u "
            "join public.user_org_roles r on r.user_id = u.id where u.id = $1",
            user_id,
        )
        token_neu = await kern.sitzung_anlegen(conn, user_id, zeile["org_id"], user_agent or "")
    _keks_setzen(request, antwort, token_neu)
    return Lage(angemeldet=True, name=zeile["display_name"] or zeile["olares_username"], modus=settings.anmeldung_modus)




class Geraet(BaseModel):
    """Eine offene Sitzung. Kein Token, keine Adresse — nur, was hilft,
    ein fremdes Gerät zu erkennen."""

    id: UUID
    erstellt_am: datetime
    zuletzt_am: datetime
    laeuft_ab: datetime
    agent: str | None = None
    # Das Gerät, von dem diese Anfrage kommt. Es lässt sich nicht beenden,
    # ohne sich abzumelden — dafür gibt es „Abmelden“.
    aktuell: bool = False


@router.get("/anmeldung/geraete", response_model=list[Geraet])
async def geraete(request: Request, user: CurrentUser = Depends(get_current_user)) -> list[Geraet]:
    """Wo bin ich überall angemeldet?

    Sichtbar sind ausschließlich die eigenen Sitzungen — dafür sorgt die
    Zeilensicherheit über `sitzungen_selbst` und nicht erst diese Abfrage.
    """
    keks = request.cookies.get(kern.KEKS)
    hier = kern.token_hash(keks) if keks else ""
    async with acquire_as(user.user_id) as conn:
        zeilen = await conn.fetch(
            "select id, token_hash, erstellt_am, zuletzt_am, laeuft_ab, agent "
            "from public.sitzungen "
            "where user_id = $1 and beendet_am is null and laeuft_ab > now() "
            "order by zuletzt_am desc",
            user.user_id,
        )
    return [
        Geraet(
            id=z["id"], erstellt_am=z["erstellt_am"], zuletzt_am=z["zuletzt_am"],
            laeuft_ab=z["laeuft_ab"], agent=z["agent"], aktuell=z["token_hash"] == hier,
        )
        for z in zeilen
    ]


@router.delete("/anmeldung/geraete/{geraet_id}", status_code=204)
async def geraet_beenden(
    geraet_id: UUID, request: Request, user: CurrentUser = Depends(get_current_user)
) -> Response:
    """Beendet **eine** Sitzung, serverseitig.

    Die Bedingung `user_id = $2` ist nicht überflüssig neben der
    Zeilensicherheit: Sie ist die zweite Wand, falls jemand die Policy
    einmal lockert. Ein fremdes Gerät zu beenden bleibt damit unmöglich,
    auch wenn man seine Kennung errät.
    """
    _herkunft_pruefen(request)
    async with acquire_as(user.user_id) as conn:
        getroffen = await conn.fetchval(
            "update public.sitzungen set beendet_am = now() "
            "where id = $1 and user_id = $2 and beendet_am is null returning id",
            geraet_id, user.user_id,
        )
    if getroffen is None:
        raise HTTPException(404, "Dieses Gerät ist nicht (mehr) angemeldet.")
    return Response(status_code=204)


@router.post("/anmeldung/geraete/andere-beenden", status_code=200)
async def andere_beenden(
    request: Request, user: CurrentUser = Depends(get_current_user)
) -> dict[str, int]:
    """Meldet alle Geräte ab außer diesem.

    Der Knopf, den man drückt, wenn ein Rechner abhandenkommt. Das eigene
    bleibt: Wer sich beim Aufräumen selbst aussperrt, muss sich neu
    anmelden und traut sich beim nächsten Mal nicht mehr.
    """
    _herkunft_pruefen(request)
    keks = request.cookies.get(kern.KEKS)
    async with acquire_as(user.user_id) as conn:
        ergebnis = await conn.execute(
            "update public.sitzungen set beendet_am = now() "
            "where user_id = $1 and beendet_am is null and token_hash <> $2",
            user.user_id, kern.token_hash(keks) if keks else "",
        )
    return {"beendet": int(ergebnis.split()[-1])}


# ── Der zweite Faktor ───────────────────────────────────────────────────
#
# Alle Wege hier stehen in `auth.OHNE_FAKTOR_ERLAUBT`: Wer den verlangten
# Faktor noch nicht hat, muss ihn einrichten können.


async def _pflicht(conn, org_id: UUID) -> bool:
    return bool(await conn.fetchval(
        "select zweiter_faktor_pflicht from public.org_settings where org_id = $1", org_id
    ))


@router.get("/anmeldung/zweiter-faktor", response_model=FaktorStand)
async def faktor_stand(user: CurrentUser = Depends(get_current_user)) -> FaktorStand:
    async with acquire_as(user.user_id) as conn:
        seit = await conn.fetchval("select totp_seit from public.users where id = $1", user.user_id)
        uebrig = await conn.fetchval(
            "select count(*) from public.zweitfaktor_codes where user_id = $1 and benutzt_am is null",
            user.user_id,
        )
        pflicht = await _pflicht(conn, user.org_id)
    return FaktorStand(aktiv=seit is not None, seit=seit, codes_uebrig=uebrig or 0, pflicht=pflicht)


@router.post("/anmeldung/zweiter-faktor/einrichten", response_model=Einrichtung)
async def faktor_einrichten(request: Request, user: CurrentUser = Depends(get_current_user)) -> Einrichtung:
    """Legt ein neues Geheimnis an — noch **nicht** aktiv.

    Aktiv wird es erst mit einem bestätigten Code. Wer hier abbricht, hat
    nichts verändert und sperrt sich nicht aus. Ist schon ein Faktor
    aktiv, wird er nicht still ersetzt: Dafür erst abschalten.
    """
    _herkunft_pruefen(request)
    geheimnis = zf.geheimnis_neu()
    async with acquire_as(user.user_id) as conn:
        getroffen = await conn.fetchval(
            "update public.users set totp_geheimnis = $2, totp_letzter_schritt = null "
            "where id = $1 and totp_seit is null returning id",
            user.user_id, tresor.verschluesseln(geheimnis),
        )
    if getroffen is None:
        raise HTTPException(409, "Der zweite Faktor ist schon eingerichtet.")
    adresse = zf.uri(geheimnis, user.login_username or user.olares_username)
    return Einrichtung(geheimnis=geheimnis, uri=adresse, qr_svg=zf.qr_svg(adresse))


@router.post("/anmeldung/zweiter-faktor/bestaetigen", response_model=Codes)
async def faktor_bestaetigen(
    daten: Code, request: Request, user: CurrentUser = Depends(get_current_user)
) -> Codes:
    """Der erste Code aus der App macht den Faktor aktiv — und bringt die
    Wiederherstellungscodes, die es nur in dieser Antwort gibt."""
    _herkunft_pruefen(request)
    async with acquire_as(user.user_id) as conn:
        row = await conn.fetchrow(
            "select totp_geheimnis, totp_seit from public.users where id = $1", user.user_id
        )
        if row is None or row["totp_seit"] is not None or not row["totp_geheimnis"]:
            raise HTTPException(409, "Es gibt keine offene Einrichtung. Bitte neu beginnen.")
        geheimnis = tresor.entschluesseln(row["totp_geheimnis"])
        schritt = zf.pruefen(geheimnis or "", daten.code, None)
        if schritt is None:
            raise HTTPException(422, "Der Code stimmt nicht. Prüfen Sie die Uhrzeit des Handys.")
        await conn.execute(
            "update public.users set totp_seit = now(), totp_letzter_schritt = $2 where id = $1",
            user.user_id, schritt,
        )
        codes = await kern.wiederherstellungscodes_neu(conn, user.user_id)
        await audit.log_fuer(conn, user, action="zweiter_faktor_eingerichtet", entity="anmeldung", entity_id=user.user_id)
    return Codes(codes=codes)


@router.post("/anmeldung/zweiter-faktor/codes", response_model=Codes)
async def codes_erneuern(
    daten: Code, request: Request, user: CurrentUser = Depends(get_current_user)
) -> Codes:
    """Zehn neue Wiederherstellungscodes gegen einen gültigen Code aus der
    App. Die alten gelten danach nicht mehr."""
    _herkunft_pruefen(request)
    async with acquire_as(user.user_id) as conn:
        if await kern.zweiter_faktor_pruefen(conn, user.user_id, daten.code) != "app":
            raise HTTPException(403, "Der Code aus der App stimmt nicht.")
        codes = await kern.wiederherstellungscodes_neu(conn, user.user_id)
        await audit.log_fuer(conn, user, action="wiederherstellungscodes_neu", entity="anmeldung", entity_id=user.user_id)
    return Codes(codes=codes)


@router.post("/anmeldung/zweiter-faktor/abschalten", status_code=204)
async def faktor_abschalten(
    daten: Abschalten, request: Request, user: CurrentUser = Depends(get_current_user)
) -> Response:
    """Nur mit Passwort **und** Code — ein offener Browser allein genügt
    nicht. Verlangt die Organisation den Faktor, geht es gar nicht."""
    _herkunft_pruefen(request)
    async with acquire_as(user.user_id) as conn:
        if await _pflicht(conn, user.org_id):
            raise HTTPException(403, "Ihre Organisation verlangt den zweiten Faktor.")
        hash_wert = await conn.fetchval("select passwort_hash from public.users where id = $1", user.user_id)
        if not kern.passwort_stimmt(hash_wert, daten.passwort):
            raise HTTPException(403, "Das Passwort stimmt nicht.")
        if await kern.zweiter_faktor_pruefen(conn, user.user_id, daten.code) is None:
            raise HTTPException(403, "Der Code stimmt nicht.")
        await kern.zweiter_faktor_zuruecksetzen(conn, user.user_id)
        await audit.log_fuer(conn, user, action="zweiter_faktor_abgeschaltet", entity="anmeldung", entity_id=user.user_id)
    return Response(status_code=204)


@router.put("/anmeldung/zweiter-faktor/pflicht", response_model=FaktorStand)
async def pflicht_setzen(
    daten: Pflicht, request: Request, user: CurrentUser = Depends(verwaltet)
) -> FaktorStand:
    """Der Schalter für die ganze Organisation.

    Einschalten darf nur, wer selbst schon einen Faktor hat — sonst sperrte
    man sich im selben Klick aus allem außer der Einrichtung aus.
    Menschen ohne Faktor werden danach bei jedem Aufruf zur Einrichtung
    geführt (`auth.get_current_user`).
    """
    _herkunft_pruefen(request)
    async with acquire_as(user.user_id) as conn:
        seit = await conn.fetchval("select totp_seit from public.users where id = $1", user.user_id)
        if daten.an and seit is None:
            raise HTTPException(409, "Richten Sie zuerst Ihren eigenen zweiten Faktor ein.")
        await conn.execute(
            "insert into public.org_settings (org_id, zweiter_faktor_pflicht) values ($1, $2) "
            "on conflict (org_id) do update set zweiter_faktor_pflicht = excluded.zweiter_faktor_pflicht",
            user.org_id, daten.an,
        )
        await audit.log_fuer(
            conn, user, action="zweiter_faktor_pflicht", entity="org_settings", entity_id=None,
            diff={"an": daten.an},
        )
    return await faktor_stand(user)


# ── Rücksetzen per Mail ─────────────────────────────────────────────────

MAIL_GUELTIG_MINUTEN = 30

# Was die Mail verschickt. Tests hängen hier eine Attrappe ein.
mail_senden = versand.senden_smtp
# Laufende Hintergrundaufgaben — gehalten, damit sie nicht mitten im
# Versand eingesammelt werden, und damit Tests auf sie warten können.
_laufend: set[asyncio.Task] = set()


def _code_normal(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


async def _mail_code_schicken(name: str) -> None:
    """Schickt einen Rücksetzcode an die hinterlegte Adresse — wenn es den
    Zugang gibt, er eine Adresse hat und die Organisation Mail verschicken
    kann. Läuft im Hintergrund: Die Antwort an den Browser kommt gleich
    schnell, ob es den Namen gibt oder nicht.

    Der Code steht **nicht** in `mails` — die Tabelle ist im
    Datenbank-Blick für Verwalter lesbar. Gespeichert wird nur sein Hash
    in `passwort_links`.
    """
    try:
        async with acquire() as conn:
            person = await conn.fetchrow(
                "select u.id, u.email, u.display_name, r.org_id from public.users u "
                "join public.user_org_roles r on r.user_id = u.id "
                "where lower(u.olares_username) = lower($1) and u.deleted_at is null "
                "and u.passwort_hash is not null order by r.joined_at limit 1",
                name,
            )
        if person is None or not (person["email"] or "").strip():
            return
        async with acquire_as(person["id"]) as conn:
            konto = versand.smtp_aus(await versand._einstellungen(conn, person["org_id"]))
            if konto is None:
                return
            code = zuruecksetzen.code_neu()
            await conn.execute(
                "update public.passwort_links set benutzt_am = now() "
                "where user_id = $1 and benutzt_am is null",
                person["id"],
            )
            await conn.execute(
                "insert into public.passwort_links (token_hash, user_id, org_id, laeuft_ab) "
                "values ($1, $2, $3, now() + make_interval(mins => $4))",
                kern.token_hash(_code_normal(code)), person["id"], person["org_id"], MAIL_GUELTIG_MINUTEN,
            )
        text = (
            f"Guten Tag {person['display_name'] or name},\n\n"
            "für Ihren Zugang zu Rocket wurde ein neues Passwort angefordert.\n\n"
            f"Ihr Code: {code}\n\n"
            "Geben Sie ihn auf der Anmeldeseite unter „Passwort vergessen?“ zusammen\n"
            f"mit Ihrer Kennung „{name}“ und einem neuen Passwort ein. Er gilt\n"
            f"{MAIL_GUELTIG_MINUTEN} Minuten und nur einmal.\n\n"
            "Haben Sie das nicht angefordert, tun Sie nichts — Ihr Passwort bleibt,\n"
            "wie es ist. Ein eingerichteter zweiter Faktor gilt auch danach weiter.\n"
        )
        nachricht = versand.nachricht_bauen(
            an=person["email"].strip(), betreff="Rocket — Passwort zurücksetzen", text=text,
            konto=konto, message_id=versand.neue_message_id(konto.absender),
        )
        await mail_senden(konto, nachricht)
    except Exception:  # noqa: BLE001 — ein Hintergrundversand darf nichts mitreißen
        log.exception("Rücksetzmail für %s nicht verschickt", name)


def _im_hintergrund(koroutine) -> None:
    aufgabe = asyncio.create_task(koroutine)
    _laufend.add(aufgabe)
    aufgabe.add_done_callback(_laufend.discard)
