"""Der zweite Faktor — TOTP aus einer Authenticator-App.

RFC 6238 ist klein genug, um ihn hier selbst zu rechnen: HMAC-SHA1 über
den Zeitschritt, vier Byte herausgeschnitten, sechs Ziffern. Eine
Bibliothek dafür wäre eine Abhängigkeit mehr für zwanzig Zeilen, die
seit 2011 feststehen. Geprüft wird gegen die Testvektoren aus dem RFC
(`tests/test_zweiter_faktor.py`).

Drei Entscheidungen:

- **Ein Schritt Nachsicht** in beide Richtungen. Handyuhren gehen
  falsch, und ein Code, der beim Tippen abläuft, soll nicht scheitern.
  Mehr Fenster hieße mehr gültige Codes zum Raten.
- **Kein Code zweimal.** Der zuletzt angenommene Zeitschritt steht an der
  Person (`totp_letzter_schritt`); gleich alte oder ältere Codes gelten
  danach nicht mehr — auch nicht in den dreißig Sekunden, in denen sie
  sonst noch gültig wären.
- **Das Geheimnis liegt im Tresor**, nie im Klartext in der Datenbank.
  Ist der Tresorschlüssel weg, lässt sich der Code nicht mehr prüfen; der
  Weg zurück ist dann das Rücksetzen über die Datei auf der Box, das den
  zweiten Faktor mit zurücksetzt (siehe `routers/anmeldung.py`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from urllib.parse import quote

import segno

SCHRITT_SEKUNDEN = 30
STELLEN = 6
NACHSICHT = 1
CODES_ANZAHL = 10
AUSSTELLER = "Rocket"


def geheimnis_neu() -> str:
    """160 Bit, wie RFC 4226 es empfiehlt — als Base32, das jede App liest."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _schluessel(geheimnis: str) -> bytes:
    auffuellen = "=" * (-len(geheimnis) % 8)
    return base64.b32decode(geheimnis.upper() + auffuellen)


def code_zu(geheimnis: str, schritt: int) -> str:
    digest = hmac.new(_schluessel(geheimnis), struct.pack(">Q", schritt), hashlib.sha1).digest()
    versatz = digest[-1] & 0x0F
    zahl = struct.unpack(">I", digest[versatz:versatz + 4])[0] & 0x7FFFFFFF
    return str(zahl % 10**STELLEN).zfill(STELLEN)


def schritt_jetzt(jetzt: float | None = None) -> int:
    return int((time.time() if jetzt is None else jetzt) // SCHRITT_SEKUNDEN)


def pruefen(geheimnis: str, code: str, letzter_schritt: int | None, jetzt: float | None = None) -> int | None:
    """Gibt den Zeitschritt des passenden Codes zurück, sonst `None`.

    Der Rückgabewert wird als `totp_letzter_schritt` gespeichert — danach
    gilt dieser und jeder ältere Code nicht mehr.
    """
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != STELLEN:
        return None
    jetzt_schritt = schritt_jetzt(jetzt)
    for schritt in range(jetzt_schritt - NACHSICHT, jetzt_schritt + NACHSICHT + 1):
        if letzter_schritt is not None and schritt <= letzter_schritt:
            continue
        # Zeitkonstant vergleichen, auch wenn sechs Ziffern wenig verraten.
        if hmac.compare_digest(code_zu(geheimnis, schritt), code):
            return schritt
    return None


def uri(geheimnis: str, konto: str) -> str:
    """Die Adresse, die der QR-Code trägt und die jede App versteht."""
    etikett = quote(f"{AUSSTELLER}:{konto}")
    return (
        f"otpauth://totp/{etikett}?secret={geheimnis}&issuer={quote(AUSSTELLER)}"
        f"&algorithm=SHA1&digits={STELLEN}&period={SCHRITT_SEKUNDEN}"
    )


def qr_svg(inhalt: str) -> str:
    """Der QR-Code als SVG — auf dem Server erzeugt, damit das Geheimnis
    nicht an einen fremden Dienst für QR-Bilder geht."""
    puffer = io.BytesIO()
    segno.make(inhalt, error="m").save(puffer, kind="svg", scale=5, border=2, xmldecl=False)
    return puffer.getvalue().decode()


# ── Wiederherstellungscodes ─────────────────────────────────────────────

# Ohne 0/O und 1/I/L: Die Codes werden abgeschrieben, oft von Papier.
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def wiederherstellungscode_neu() -> str:
    """Zehn Zeichen in zwei Gruppen, rund 50 Bit."""
    roh = "".join(secrets.choice(_ALPHABET) for _ in range(10))
    return f"{roh[:5]}-{roh[5:]}"


def code_hash(code: str) -> str:
    """Normalisiert (ohne Strich, groß) und gehasht. SHA-256 genügt: Die
    Codes sind zufällig und lang, und die Bremse zählt jeden Versuch."""
    rein = "".join(ch for ch in code.upper() if ch.isalnum())
    return hashlib.sha256(rein.encode()).hexdigest()


def sieht_aus_wie_wiederherstellungscode(code: str) -> bool:
    rein = "".join(ch for ch in code if ch.isalnum())
    return len(rein) == 10 and not rein.isdigit()
