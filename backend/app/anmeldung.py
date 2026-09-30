"""Die eigene Anmeldung — Passwörter, Sitzungen, Einladungen, Bremse.

Rocket baut hier zum ersten Mal eigene Authentifizierung, und das ist ein
bewusster Bruch mit der Hausregel „keine eigene Anmeldung, das macht
Olares". Der Grund steht in der Migration 0026: Eine Olares-App wird je
Nutzer installiert, ein zweites Konto bekäme ein zweites, leeres Rocket.
Für ein Team in **einem** Bestand gibt es keinen Olares-Weg.

Was hier gilt, gilt ohne Ausnahme:

- **Nie das Geheimnis speichern.** Vom Passwort bleibt ein argon2id-Hash,
  vom Sitzungstoken ein SHA-256. Wer die Datenbank liest, kann sich damit
  nicht anmelden.
- **Sitzungen leben auf dem Server.** Ein selbstsigniertes Token im Keks
  wäre nach „Abmelden" weiter gültig — bis es abläuft. Eine Zeile in
  `sitzungen` lässt sich dagegen wirklich beenden.
- **Nichts verrät, ob es einen Namen gibt.** Falsches Passwort und
  unbekannter Name antworten gleich und dauern gleich lang. Sonst ist die
  Anmeldemaske eine Auskunft darüber, wer im Haus arbeitet.
- **Zehn Versuche, dann Pause.** Je Name *und* je Adresse. Ohne Bremse
  probiert ein Skript Passwörter, so schnell die Leitung trägt.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app import tresor
from app import zweiterfaktor as zf
from app.config import settings

# Die Vorgaben von argon2-cffi sind für einen Webdienst brauchbar
# gewählt (RFC 9106, „second recommended option"). Wir setzen sie nicht
# selbst herunter — ein schnelleres Hashen ist genau das, was ein
# Angreifer sich wünscht.
_hasher = PasswordHasher()

KEKS = "rocket_sitzung"
# Der Keks der Vorstufe: Passwort stimmt, Code steht aus. Ein eigener
# Name, damit er nie mit einer vollen Sitzung verwechselt wird.
VORSTUFE_KEKS = "rocket_vorstufe"
VORSTUFE_MINUTEN = 5
# Je Name zehn Versuche. Je Adresse großzügiger: Hinter einer Adresse
# sitzt oft ein ganzes Büro, und ein Tippfehler des Kollegen darf niemanden
# sonst aussperren. Beide Grenzen gelten **getrennt** — zusammengezählt
# spränge die Bremse schon nach fünf Versuchen.
VERSUCHE_HOECHSTENS = 10
VERSUCHE_JE_ADRESSE = 50
VERSUCHE_FENSTER_MINUTEN = 15


class Anmeldefehler(RuntimeError):  # noqa: N818
    """Name oder Passwort stimmt nicht — mehr sagt die Antwort nie.

    `user_id` und `org_id` sind gesetzt, wenn es den Namen gibt — nur fürs
    Protokoll, nie für die Antwort."""

    def __init__(self, meldung: str, user_id: UUID | None = None, org_id: UUID | None = None) -> None:
        super().__init__(meldung)
        self.user_id = user_id
        self.org_id = org_id


class ZuVieleVersuche(RuntimeError):  # noqa: N818
    def __init__(self, sekunden: int) -> None:
        super().__init__("Zu viele Versuche.")
        self.sekunden = sekunden


# ── Passwörter ───────────────────────────────────────────────────────────


def hash_passwort(passwort: str) -> str:
    return _hasher.hash(passwort)


def passwort_stimmt(hash_wert: str | None, passwort: str) -> bool:
    """Prüft das Passwort. Ohne hinterlegten Hash immer falsch — aber erst,
    nachdem einmal gerechnet wurde: Sonst antwortet ein Konto ohne Passwort
    messbar schneller und verrät sich dadurch."""
    if not hash_wert:
        _hasher.hash(passwort)  # gleiche Rechenzeit wie ein echter Versuch
        return False
    try:
        _hasher.verify(hash_wert, passwort)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


def muss_neu_gehasht_werden(hash_wert: str) -> bool:
    """Wurde der Hash mit älteren Parametern erzeugt? Dann beim nächsten
    erfolgreichen Anmelden still erneuern."""
    try:
        return _hasher.check_needs_rehash(hash_wert)
    except InvalidHashError:
        return False


def passwort_pruefen(passwort: str) -> None:
    """Die einzige Regel: lang genug. Zeichenklassen erzwingen erzeugt
    „Passwort1!" und sonst nichts (NIST SP 800-63B)."""
    if len(passwort) < 12:
        raise ValueError("Das Passwort muss mindestens zwölf Zeichen haben.")
    if len(passwort) > 200:
        raise ValueError("Das Passwort ist zu lang.")


# ── Token und Sitzungen ──────────────────────────────────────────────────


def token_neu() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class Sitzung:
    user_id: UUID
    org_id: UUID
    laeuft_ab: datetime


async def _pinnen(conn: asyncpg.Connection, hash_wert: str) -> None:
    """Nennt der Verbindung den Hash, um den es geht.

    Die Zeilensicherheit auf `sitzungen` und `einladungen` gibt daraufhin
    genau diese eine Zeile frei (siehe Migration 0026). Ohne das kämen die
    Abfragen hier gar nicht an ihre Zeile heran — der Anmeldeweg hat noch
    keinen Nutzerkontext, weil er ihn ja erst herstellt.
    """
    await conn.execute("select set_config('app.anmelde_token', $1, true)", hash_wert)


async def sitzung_anlegen(
    conn: asyncpg.Connection, user_id: UUID, org_id: UUID, agent: str, *, vorstufe: bool = False
) -> str:
    """Legt eine Sitzung an und gibt das Token zurück — das einzige Mal,
    dass es im Klartext existiert.

    Eine **Vorstufe** (`bestaetigt = false`) lebt fünf Minuten und taugt
    nur dazu, den Code des zweiten Faktors einzugeben.
    """
    token = token_neu()
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        await conn.execute(
            "insert into public.sitzungen (token_hash, user_id, org_id, laeuft_ab, agent, bestaetigt) "
            "values ($1, $2, $3, now() + make_interval(mins => $4), $5, $6)",
            token_hash(token), user_id, org_id,
            VORSTUFE_MINUTEN if vorstufe else settings.sitzung_tage * 24 * 60,
            agent[:300], not vorstufe,
        )
    return token


async def sitzung_lesen(conn: asyncpg.Connection, token: str) -> Sitzung | None:
    """Gültige Sitzung zum Token, oder nichts.

    Geprüft werden drei Dinge: nicht beendet, nicht abgelaufen, und nicht
    zu lange still. Der Leerlauf ist der Grund, warum `zuletzt_am`
    fortgeschrieben wird — ein vergessener Browser im Zug soll nicht
    dreißig Tage offen stehen.
    """
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        row = await conn.fetchrow(
            """
            update public.sitzungen
               set zuletzt_am = now()
             where token_hash = $1
               and bestaetigt
               and beendet_am is null
               and laeuft_ab > now()
               and zuletzt_am > now() - make_interval(days => $2)
            returning user_id, org_id, laeuft_ab
            """,
            token_hash(token), settings.sitzung_leerlauf_tage,
        )
    if row is None:
        return None
    return Sitzung(user_id=row["user_id"], org_id=row["org_id"], laeuft_ab=row["laeuft_ab"])


async def vorstufe_lesen(conn: asyncpg.Connection, token: str) -> Sitzung | None:
    """Die offene Vorstufe zu diesem Token — oder nichts."""
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        row = await conn.fetchrow(
            "select user_id, org_id, laeuft_ab from public.sitzungen "
            "where token_hash = $1 and not bestaetigt and beendet_am is null and laeuft_ab > now()",
            token_hash(token),
        )
    if row is None:
        return None
    return Sitzung(user_id=row["user_id"], org_id=row["org_id"], laeuft_ab=row["laeuft_ab"])


async def sitzung_beenden(conn: asyncpg.Connection, token: str) -> None:
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        await conn.execute(
            "update public.sitzungen set beendet_am = now() "
            "where token_hash = $1 and beendet_am is null",
            token_hash(token),
        )


async def sitzungen_aufraeumen(conn: asyncpg.Connection) -> int:
    """Abgelaufenes wegräumen. Eine beendete Sitzung ist kein Protokoll —
    wer sich wann anmeldete, steht im Audit-Log, nicht hier."""
    return int(
        (
            await conn.execute(
                "delete from public.sitzungen where laeuft_ab < now() - interval '7 days'"
            )
        ).split()[-1]
    )


# ── Die Bremse ───────────────────────────────────────────────────────────


async def bremse_pruefen(conn: asyncpg.Connection, kennungen: list[str]) -> None:
    """Wirft `ZuVieleVersuche`, wenn eine der Kennungen zu oft danebenlag.

    Gezählt wird je Name **und** je Adresse: Der Name schützt ein einzelnes
    Konto gegen Raten, die Adresse schützt alle Konten gegen ein Skript,
    das viele Namen durchprobiert.
    """
    zeilen = await conn.fetch(
        "select kennung, count(*) as anzahl from public.anmeldeversuche "
        "where kennung = any($1::text[]) and am > now() - make_interval(mins => $2) "
        "group by kennung",
        kennungen, VERSUCHE_FENSTER_MINUTEN,
    )
    for zeile in zeilen:
        grenze = VERSUCHE_JE_ADRESSE if zeile["kennung"].startswith("ip:") else VERSUCHE_HOECHSTENS
        if zeile["anzahl"] >= grenze:
            raise ZuVieleVersuche(VERSUCHE_FENSTER_MINUTEN * 60)


async def versuch_merken(conn: asyncpg.Connection, kennungen: list[str]) -> None:
    for k in kennungen:
        await conn.execute("insert into public.anmeldeversuche (kennung) values ($1)", k)


async def versuche_loeschen(conn: asyncpg.Connection, kennungen: list[str]) -> None:
    """Nach einer gelungenen Anmeldung ist die Zählung erledigt."""
    await conn.execute("delete from public.anmeldeversuche where kennung = any($1::text[])", kennungen)


# ── Der zweite Faktor ────────────────────────────────────────────────────


async def zweiter_faktor_aktiv(conn: asyncpg.Connection, user_id: UUID) -> bool:
    return bool(await conn.fetchval("select totp_seit is not null from public.users where id = $1", user_id))


async def zweiter_faktor_pruefen(conn: asyncpg.Connection, user_id: UUID, code: str) -> str | None:
    """Prüft einen Code aus der App oder einen Wiederherstellungscode.

    Gibt `"app"` oder `"wiederherstellung"` zurück, sonst `None`. Ein
    angenommener Code ist danach verbraucht — der App-Code über den
    Zeitschritt, der Wiederherstellungscode über `benutzt_am`.
    """
    if zf.sieht_aus_wie_wiederherstellungscode(code):
        async with conn.transaction():
            await conn.execute("select set_config('app.zweitfaktor_fuer', $1, true)", str(user_id))
            getroffen = await conn.fetchval(
                "update public.zweitfaktor_codes set benutzt_am = now() "
                "where user_id = $1 and code_hash = $2 and benutzt_am is null returning id",
                user_id, zf.code_hash(code),
            )
        return "wiederherstellung" if getroffen else None

    row = await conn.fetchrow(
        "select totp_geheimnis, totp_letzter_schritt from public.users where id = $1 and totp_seit is not null",
        user_id,
    )
    geheimnis = tresor.entschluesseln(row["totp_geheimnis"]) if row else None
    if not geheimnis:
        return None
    schritt = zf.pruefen(geheimnis, code, row["totp_letzter_schritt"])
    if schritt is None:
        return None
    # Bedingt schreiben: Zwei gleichzeitige Anmeldungen mit demselben Code
    # dürfen nicht beide durchkommen.
    angenommen = await conn.fetchval(
        "update public.users set totp_letzter_schritt = $2 "
        "where id = $1 and coalesce(totp_letzter_schritt, -1) < $2 returning id",
        user_id, schritt,
    )
    return "app" if angenommen else None


async def wiederherstellungscodes_neu(conn: asyncpg.Connection, user_id: UUID) -> list[str]:
    """Zehn neue Codes; alle alten gelten danach nicht mehr. Die Codes
    gibt es nur in diesem Moment im Klartext."""
    codes = [zf.wiederherstellungscode_neu() for _ in range(zf.CODES_ANZAHL)]
    # `set_config(..., true)` gilt bis zum Ende der Transaktion — ohne eine
    # sähe schon die nächste Anweisung die Codes nicht mehr.
    async with conn.transaction():
        await conn.execute("select set_config('app.zweitfaktor_fuer', $1, true)", str(user_id))
        await conn.execute("delete from public.zweitfaktor_codes where user_id = $1", user_id)
        for c in codes:
            await conn.execute(
                "insert into public.zweitfaktor_codes (user_id, code_hash) values ($1, $2)",
                user_id, zf.code_hash(c),
            )
    return codes


async def zweiter_faktor_zuruecksetzen(conn: asyncpg.Connection, user_id: UUID) -> None:
    """Nimmt den zweiten Faktor weg — beim Neuvergeben eines Zugangs und
    beim Rücksetzen über die Datei auf der Box. Beides tut nur, wer
    ohnehin über das Konto verfügen darf."""
    await conn.execute(
        "update public.users set totp_geheimnis = null, totp_seit = null, totp_letzter_schritt = null "
        "where id = $1",
        user_id,
    )
    async with conn.transaction():
        await conn.execute("select set_config('app.zweitfaktor_fuer', $1, true)", str(user_id))
        await conn.execute("delete from public.zweitfaktor_codes where user_id = $1", user_id)


# ── Anmelden ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Anmeldung:
    """Was eine gelungene Passwortprüfung ergibt. Ist `vorstufe` wahr,
    ist `token` nur die Vorstufe — der Code steht noch aus."""

    token: str
    vorstufe: bool
    user_id: UUID
    org_id: UUID


async def anmelden(conn: asyncpg.Connection, name: str, passwort: str, agent: str, adresse: str) -> Anmeldung:
    """Prüft Name und Passwort und gibt bei Erfolg ein Sitzungstoken —
    oder, wenn ein zweiter Faktor eingerichtet ist, die Vorstufe.

    Jeder Fehlerweg endet in derselben Meldung und derselben Rechenzeit.
    """
    kennungen = [f"name:{name.strip().lower()}", f"ip:{adresse}"]
    await bremse_pruefen(conn, kennungen)

    row = await conn.fetchrow(
        """
        select u.id, u.passwort_hash, u.gesperrt_bis, r.org_id
          from public.users u
          left join public.user_org_roles r on r.user_id = u.id
         where lower(u.olares_username) = lower($1) and u.deleted_at is null
         order by r.joined_at
         limit 1
        """,
        name.strip(),
    )

    gesperrt = bool(row and row["gesperrt_bis"] and row["gesperrt_bis"] > datetime.now(UTC))
    if not passwort_stimmt(row["passwort_hash"] if row else None, passwort) or gesperrt or row is None:
        await versuch_merken(conn, kennungen)
        raise Anmeldefehler(
            "Name oder Passwort stimmt nicht.",
            user_id=row["id"] if row else None,
            org_id=row["org_id"] if row else None,
        )

    if row["org_id"] is None:
        # Ein Konto ohne Organisation kann nicht arbeiten. Das ist kein
        # Anmeldefehler des Menschen, aber auch kein Zugang.
        raise Anmeldefehler("Name oder Passwort stimmt nicht.")

    if muss_neu_gehasht_werden(row["passwort_hash"]):
        await conn.execute(
            "update public.users set passwort_hash = $1 where id = $2",
            hash_passwort(passwort), row["id"],
        )

    if await zweiter_faktor_aktiv(conn, row["id"]):
        # Die Versuche bleiben stehen: Sie werden erst gelöscht, wenn auch
        # der Code stimmt. Sonst setzte ein richtiges Passwort die Bremse
        # für das Raten der sechs Ziffern jedes Mal zurück.
        token = await sitzung_anlegen(conn, row["id"], row["org_id"], agent, vorstufe=True)
        return Anmeldung(token=token, vorstufe=True, user_id=row["id"], org_id=row["org_id"])

    await versuche_loeschen(conn, kennungen)
    token = await sitzung_anlegen(conn, row["id"], row["org_id"], agent)
    return Anmeldung(token=token, vorstufe=False, user_id=row["id"], org_id=row["org_id"])


# ── Einladungen ──────────────────────────────────────────────────────────


async def einladung_anlegen(
    conn: asyncpg.Connection, user_id: UUID, org_id: UUID, erstellt_von: UUID
) -> str:
    """Ein Zugang entsteht nur so. Eine offene Registrierung gibt es nicht.

    Ältere, unbenutzte Einladungen derselben Person werden entwertet:
    Zwei gültige Links für dasselbe Konto sind ein Link zu viel.
    """
    await conn.execute(
        "update public.einladungen set benutzt_am = now() "
        "where user_id = $1 and benutzt_am is null",
        user_id,
    )
    token = token_neu()
    await conn.execute(
        "insert into public.einladungen (token_hash, user_id, org_id, erstellt_von, laeuft_ab) "
        "values ($1, $2, $3, $4, now() + make_interval(days => $5))",
        token_hash(token), user_id, org_id, erstellt_von, settings.einladung_tage,
    )
    return token


async def einladung_lesen(conn: asyncpg.Connection, token: str) -> asyncpg.Record | None:
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        return await conn.fetchrow(
            """
            select e.id, e.user_id, e.org_id, u.display_name, u.olares_username,
                   u.passwort_hash is not null as hat_passwort
              from public.einladungen e
              join public.users u on u.id = e.user_id
             where e.token_hash = $1 and e.benutzt_am is null and e.laeuft_ab > now()
            """,
            token_hash(token),
        )


async def einladung_einloesen(conn: asyncpg.Connection, token: str, passwort: str) -> UUID:
    """Setzt das Passwort und entwertet die Einladung — in einem Zug, damit
    ein zweiter Klick auf denselben Link nichts mehr ausrichtet."""
    passwort_pruefen(passwort)
    async with conn.transaction():
        await _pinnen(conn, token_hash(token))
        row = await conn.fetchrow(
            "update public.einladungen set benutzt_am = now() "
            "where token_hash = $1 and benutzt_am is null and laeuft_ab > now() "
            "returning user_id",
            token_hash(token),
        )
    if row is None:
        raise Anmeldefehler("Diese Einladung gilt nicht mehr.")
    await conn.execute(
        "update public.users set passwort_hash = $1, passwort_am = now(), gesperrt_bis = null "
        "where id = $2",
        hash_passwort(passwort), row["user_id"],
    )
    # Eine Einladung vergibt den Zugang neu — samt zweitem Faktor. Das ist
    # der Weg für das verlorene Handy ohne Wiederherstellungscodes: Der
    # Verwalter lädt neu ein, die Person richtet den Faktor neu ein.
    await zweiter_faktor_zuruecksetzen(conn, row["user_id"])
    return row["user_id"]


def frist(tage: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=tage)
