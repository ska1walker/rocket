"""Das persönliche Postfach lesen (seit 26.10.20, Stufe 2 aus docs/PLAN-TEAM.md).

Jede Person verbindet ihr Postfach; Rocket holt Posteingang und Gesendet
und legt **nur** Mails ab, bei denen Absender oder ein Empfänger schon
Kontakt ist. Was niemanden im CRM betrifft, wird nicht gespeichert, nur die
UID weitergezählt — private Post landet nie in der Datenbank. Gelesen wird
in zwei Schritten: erst die Kopfzeilen, dann der Inhalt nur der Mails, die
zugeordnet werden. So verlässt auch ein privater Text das Postfach nicht.

Wie beim Postfach der Organisation (`app/postfach.py`):

- **Keine Markierung wird angefasst.** Der Ordner wird schreibgeschützt
  geöffnet, Nachrichten mit `BODY.PEEK` gelesen — kein `\\Seen`, kein
  Verschieben.
- **Gemerkt wird eine UID** je Ordner, samt UIDVALIDITY.
- **Automaten werden übergangen** (Abwesenheitsnotizen, Verteiler).

Jede Abfrage läuft als die Person selbst (`acquire_as(user_id)`): Sie
ordnet nur Kontakten zu, die sie sieht — ein Trainer seinen Spielern.

Dieselbe Mail in zwei Postfächern (Kai in Kopie zu Marcs Mail) wird ein
Verlaufseintrag, nicht zwei: Die Message-ID ist die Kennung (`external_id`).
"""

from __future__ import annotations

import asyncio
import email
import imaplib
import smtplib
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.message import Message
from email.utils import getaddresses, parseaddr, parsedate_to_datetime
from typing import Any, Protocol
from uuid import UUID

import asyncpg
import orjson

from app import postfach, tresor

# Wie viele Nachrichten ein Lauf je Ordner höchstens ansieht.
MAX_JE_LAUF = 200
# Der erste Lauf liest nicht das ganze Postfach, nur die letzten Tage.
ERSTLAUF_TAGE = 14
# Größer als das wird nur mit Kopfzeilen abgelegt — kein Text, Anhänge
# nur mit Namen.
MAX_GROESSE = 5 * 1024 * 1024
# Alle wie viel Minuten ein Postfach dran ist.
TAKT_MINUTEN = 2
ART_EIN, ART_AUS = "ein", "aus"


@dataclass(frozen=True)
class Konto:
    id: UUID
    org_id: UUID
    user_id: UUID
    adresse: str
    benutzer: str
    passwort: str
    imap_host: str
    imap_port: int
    smtp_host: str | None
    smtp_port: int
    smtp_sicherheit: str
    ordner_ein: str
    ordner_aus: str | None

    @classmethod
    def aus_zeile(cls, z: Any) -> Konto:
        return cls(
            id=z["id"], org_id=z["org_id"], user_id=z["user_id"], adresse=z["adresse"].strip().lower(),
            benutzer=z["benutzer"], passwort=tresor.entschluesseln(z["passwort"]) or "",
            imap_host=z["imap_host"], imap_port=z["imap_port"], smtp_host=z["smtp_host"],
            smtp_port=z["smtp_port"], smtp_sicherheit=z["smtp_sicherheit"],
            ordner_ein=z["ordner_ein"], ordner_aus=z["ordner_aus"],
        )


# ── Der IMAP-Teil (blockierend, läuft im Faden) ─────────────────────────


class Zugang(Protocol):
    def gesendet_finden(self) -> str | None: ...
    def neue(self, ordner: str, ab: int | None, uidv_alt: int | None) -> tuple[int | None, list[tuple[int, Message, int]]]: ...
    def inhalte(self, ordner: str, uids: list[int]) -> dict[int, Message]: ...
    def schliessen(self) -> None: ...


def _uidvalidity(verbindung: imaplib.IMAP4, ordner: str) -> int | None:
    art, roh = verbindung.status(_q(ordner), "(UIDVALIDITY)")
    if art == "OK" and roh and roh[0]:
        teil = roh[0].decode("ascii", "replace")
        if "UIDVALIDITY" in teil:
            ziffern = "".join(c for c in teil.split("UIDVALIDITY")[1] if c.isdigit())
            return int(ziffern) if ziffern else None
    return None


def _q(ordner: str) -> str:
    return '"' + ordner.replace("\\", "\\\\").replace('"', '\\"') + '"'


# Wie „Gesendet“ heißt, wenn der Server es nicht über SPECIAL-USE sagt.
GESENDET_NAMEN = ("Sent", "Gesendet", "Gesendete Objekte", "Gesendete Elemente", "Sent Items",
                  "Sent Messages", "INBOX.Sent", "INBOX/Sent", "[Gmail]/Sent Mail", "[Gmail]/Gesendet")


class ImapZugang:
    """Eine Verbindung je Lauf. Öffnet jeden Ordner nur lesend."""

    def __init__(self, konto: Konto) -> None:
        self.v = imaplib.IMAP4_SSL(konto.imap_host, konto.imap_port, timeout=30,
                                   ssl_context=ssl.create_default_context())
        self.v.login(konto.benutzer, konto.passwort)

    def gesendet_finden(self) -> str | None:
        art, zeilen = self.v.list()
        if art != "OK":
            return None
        namen: list[str] = []
        for roh in zeilen or []:
            zeile = roh.decode("utf-7", "replace") if isinstance(roh, bytes) else str(roh)
            name = zeile.rsplit(' "', 1)[-1].rstrip('"') if zeile.endswith('"') else zeile.rsplit(" ", 1)[-1]
            if "\\Sent" in zeile:
                return name
            namen.append(name)
        return next((n for n in GESENDET_NAMEN if n in namen), None)

    def neue(self, ordner: str, ab: int | None, uidv_alt: int | None):
        art, _ = self.v.select(_q(ordner), readonly=True)
        if art != "OK":
            raise RuntimeError(f"Ordner „{ordner}“ nicht gefunden.")
        uidv = _uidvalidity(self.v, ordner)
        if uidv_alt is not None and uidv != uidv_alt:
            ab = None
        if ab:
            art, gefunden = self.v.uid("SEARCH", None, "UID", f"{ab + 1}:*")
        else:
            seit = (datetime.now(UTC) - timedelta(days=ERSTLAUF_TAGE)).strftime("%d-%b-%Y")
            art, gefunden = self.v.uid("SEARCH", None, "SINCE", seit)
        if art != "OK":
            return uidv, []
        uids = sorted(int(u) for u in (gefunden[0] or b"").split() if not ab or int(u) > ab)[:MAX_JE_LAUF]
        if not uids:
            return uidv, []
        art, teile = self.v.uid("FETCH", ",".join(map(str, uids)),
                                "(UID RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID "
                                "IN-REPLY-TO REFERENCES AUTO-SUBMITTED PRECEDENCE LIST-ID LIST-UNSUBSCRIBE "
                                "X-AUTOREPLY X-AUTORESPOND)])")
        ergebnis: list[tuple[int, Message, int]] = []
        for teil in teile or []:
            if not isinstance(teil, tuple):
                continue
            kopf = teil[0].decode("ascii", "replace")
            uid = _zahl_nach(kopf, "UID")
            groesse = _zahl_nach(kopf, "RFC822.SIZE") or 0
            if uid:
                ergebnis.append((uid, email.message_from_bytes(teil[1]), groesse))
        return uidv, sorted(ergebnis, key=lambda x: x[0])

    def inhalte(self, ordner: str, uids: list[int]) -> dict[int, Message]:
        if not uids:
            return {}
        self.v.select(_q(ordner), readonly=True)
        art, teile = self.v.uid("FETCH", ",".join(map(str, uids)), "(UID BODY.PEEK[])")
        fertig: dict[int, Message] = {}
        for teil in teile or []:
            if isinstance(teil, tuple):
                uid = _zahl_nach(teil[0].decode("ascii", "replace"), "UID")
                if uid:
                    fertig[uid] = email.message_from_bytes(teil[1])
        return fertig

    def schliessen(self) -> None:
        try:
            self.v.logout()
        except Exception:
            pass


def _zahl_nach(text: str, wort: str) -> int | None:
    if wort not in text:
        return None
    rest = text.split(wort, 1)[1].lstrip()
    ziffern = ""
    for c in rest:
        if not c.isdigit():
            break
        ziffern += c
    return int(ziffern) if ziffern else None


def oeffnen(konto: Konto) -> Zugang:
    """Austauschbar: Tests setzen hier ein Postfach aus Listen ein."""
    return ImapZugang(konto)


def _smtp_pruefen(konto: Konto) -> None:
    kontext = ssl.create_default_context()
    if konto.smtp_sicherheit == "ssl":
        v: smtplib.SMTP = smtplib.SMTP_SSL(konto.smtp_host, konto.smtp_port, timeout=20, context=kontext)
    else:
        v = smtplib.SMTP(konto.smtp_host, konto.smtp_port, timeout=20)
    with v:
        v.ehlo()
        if konto.smtp_sicherheit == "starttls":
            v.starttls(context=kontext)
            v.ehlo()
        v.login(konto.benutzer, konto.passwort)


def _pruefen(konto: Konto) -> dict[str, str | None]:
    """Meldet sich an beiden Servern an. Liest und sendet nichts."""
    ergebnis: dict[str, str | None] = {"imap": None, "smtp": None, "gesendet": None}
    try:
        z = oeffnen(konto)
        try:
            ergebnis["gesendet"] = konto.ordner_aus or z.gesendet_finden()
        finally:
            z.schliessen()
    except Exception as exc:
        ergebnis["imap"] = _fehlertext(exc)
    if konto.smtp_host:
        try:
            _smtp_pruefen(konto)
        except Exception as exc:
            ergebnis["smtp"] = _fehlertext(exc)
    return ergebnis


async def pruefen(konto: Konto) -> dict[str, str | None]:
    return await asyncio.to_thread(_pruefen, konto)


def _fehlertext(exc: Exception) -> str:
    text = str(exc)
    if isinstance(exc, imaplib.IMAP4.error) or "AUTHENTICATIONFAILED" in text.upper() or isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Anmeldung abgelehnt — Benutzer oder Passwort stimmen nicht (bei Google: App-Passwort nötig)."
    return f"{type(exc).__name__}: {text}"[:300]


# ── Zuordnen ────────────────────────────────────────────────────────────


def adressen(nachricht: Message, *felder: str) -> list[str]:
    roh = [nachricht.get_all(f, []) for f in felder]
    return [a.strip().lower() for _, a in getaddresses([x for liste in roh for x in liste]) if "@" in a]


def anhaenge(nachricht: Message) -> list[dict[str, Any]]:
    liste = []
    for teil in nachricht.walk():
        name = teil.get_filename()
        if not name or teil.is_multipart():
            continue
        inhalt = teil.get_payload(decode=True) or b""
        liste.append({"name": postfach._entschluesselt(name), "groesse": len(inhalt)})
    return liste


def _zeitpunkt(roh: str | None) -> datetime | None:
    if not roh:
        return None
    try:
        zeit = parsedate_to_datetime(roh)
        return zeit if zeit.tzinfo else zeit.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


async def _kontakte(conn, kandidaten: set[str]) -> dict[str, Any]:
    if not kandidaten:
        return {}
    zeilen = await conn.fetch(
        "select id, company_id, lower(email) as email from public.contacts "
        "where lower(email) = any($1::text[]) and deleted_at is null",
        list(kandidaten),
    )
    return {z["email"]: z for z in zeilen}


async def _offenes_geschaeft(conn, contact_id: UUID) -> UUID | None:
    """Das eine offene Geschäft des Kontakts — bei zweien rät Rocket nicht."""
    zeilen = await conn.fetch(
        """
        select d.id from public.deal_contacts dc
          join public.deals d on d.id = dc.deal_id and d.deleted_at is null
          join public.pipeline_stages s on s.id = d.stage_id and s.kind = 'open'
         where dc.contact_id = $1
        """,
        contact_id,
    )
    return zeilen[0]["id"] if len(zeilen) == 1 else None


async def _ordner_lesen(conn, konto: Konto, zugang: Zugang, art: str, ordner: str,
                        ab: int | None, uidv: int | None, bilanz: dict[str, int]) -> tuple[int | None, int | None]:
    neue_uidv, koepfe = await asyncio.to_thread(zugang.neue, ordner, ab, uidv)
    if neue_uidv != uidv:
        ab = None
    hoechste = ab or 0
    treffer: list[tuple[int, Message, int, Any, str, list[str]]] = []
    kandidaten: set[str] = set()
    for uid, kopf, groesse in koepfe:
        hoechste = max(hoechste, uid)
        bilanz["gelesen"] += 1
        von = parseaddr(kopf.get("From") or "")[1].strip().lower()
        an = adressen(kopf, "To", "Cc")
        if art == ART_EIN and postfach.ist_automat(kopf):
            continue
        gegenueber = [a for a in ([von] + an) if a and a != konto.adresse]
        kandidaten.update(gegenueber)
        treffer.append((uid, kopf, groesse, von, "", gegenueber))

    bekannt = await _kontakte(conn, kandidaten)
    zuordnen = [(uid, kopf, groesse, next(a for a in gg if a in bekannt))
                for uid, kopf, groesse, _von, _, gg in treffer if any(a in bekannt for a in gg)]
    bilanz["privat"] += len(treffer) - len(zuordnen)

    klein = [uid for uid, _, groesse, _ in zuordnen if groesse <= MAX_GROESSE]
    inhalte = await asyncio.to_thread(zugang.inhalte, ordner, klein) if klein else {}

    for uid, kopf, _groesse, adresse in zuordnen:
        kontakt = bekannt[adresse]
        voll = inhalte.get(uid)
        von = parseaddr(kopf.get("From") or "")[1].strip().lower()
        richtung = "ausgehend" if von == konto.adresse else "eingehend"
        betreff = postfach._entschluesselt(kopf.get("Subject")) or "(ohne Betreff)"
        text = postfach._text_aus(voll)[: postfach.MAX_TEXT] if voll is not None else ""
        message_id = (kopf.get("Message-ID") or "").strip() or f"{konto.id}:{ordner}:{uid}"
        payload = {
            "richtung": richtung, "von": von, "an": adressen(kopf, "To"), "cc": adressen(kopf, "Cc"),
            "message_id": message_id, "in_reply_to": (kopf.get("In-Reply-To") or "").strip() or None,
            "anhaenge": anhaenge(voll) if voll is not None else [], "quelle": "postfach",
            "mailkonto_id": str(konto.id), "ohne_inhalt": voll is None,
        }
        wort = f"An {adresse}" if richtung == "ausgehend" else f"Von {von}"
        geschaeft = await _offenes_geschaeft(conn, kontakt["id"])
        try:
            # Ein eigener Sicherungspunkt je Mail: Wer einen Kontakt nur
            # lesen darf (Co-Trainer), kann dort nichts ablegen — das soll
            # diese eine Mail übergehen, nicht den ganzen Lauf.
            async with conn.transaction():
                neu = await conn.fetchval(
                    """
                    insert into public.activities (org_id, kind, subject, body, occurred_at, company_id,
                                                   contact_id, deal_id, payload, external_source, external_id,
                                                   created_by)
                    values ($1, 'email', $2, $3, coalesce($4, now()), $5, $6, $7, $8::jsonb, 'mail', $9, $10)
                    on conflict do nothing returning id
                    """,
                    konto.org_id, f"{wort}: {betreff}"[:300], text, _zeitpunkt(kopf.get("Date")),
                    kontakt["company_id"], kontakt["id"], geschaeft,
                    orjson.dumps(payload).decode(), message_id[:500], konto.user_id,
                )
        except asyncpg.InsufficientPrivilegeError:
            bilanz["ohne_recht"] += 1
            continue
        bilanz["zugeordnet" if neu else "doppelt"] += 1
    return (hoechste or None), neue_uidv


async def einlesen(conn, konto_zeile: Any) -> dict[str, int]:
    """Ein Lauf über Posteingang und Gesendet. Gibt die Bilanz zurück.

    `conn` läuft als die Person, der das Postfach gehört.
    """
    konto = Konto.aus_zeile(konto_zeile)
    bilanz = {"gelesen": 0, "zugeordnet": 0, "privat": 0, "doppelt": 0, "ohne_recht": 0}
    zugang = await asyncio.to_thread(oeffnen, konto)
    try:
        uid_ein, uidv_ein = await _ordner_lesen(
            conn, konto, zugang, ART_EIN, konto.ordner_ein,
            konto_zeile["uid_ein"], konto_zeile["uidv_ein"], bilanz,
        )
        ordner_aus = konto.ordner_aus or await asyncio.to_thread(zugang.gesendet_finden)
        uid_aus, uidv_aus = konto_zeile["uid_aus"], konto_zeile["uidv_aus"]
        if ordner_aus:
            uid_aus, uidv_aus = await _ordner_lesen(
                conn, konto, zugang, ART_AUS, ordner_aus, uid_aus, uidv_aus, bilanz,
            )
    finally:
        await asyncio.to_thread(zugang.schliessen)
    await conn.execute(
        """
        update public.mailkonten
           set uid_ein = $2, uidv_ein = $3, uid_aus = $4, uidv_aus = $5, ordner_aus = $6,
               zuletzt = now(), letzter_fehler = null, eingelesen = eingelesen + $7
         where id = $1
        """,
        konto.id, uid_ein, uidv_ein, uid_aus, uidv_aus, ordner_aus, bilanz["zugeordnet"],
    )
    return bilanz


async def fehler_merken(conn, konto_id: UUID, exc: Exception) -> None:
    await conn.execute(
        "update public.mailkonten set letzter_fehler = $2, zuletzt = now() where id = $1",
        konto_id, _fehlertext(exc),
    )
