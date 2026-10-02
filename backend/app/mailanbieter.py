"""Voreinstellungen für das persönliche Postfach (seit 26.10.20).

Daten, keine Logik: Eine neue Voreinstellung ist eine Zeile. Geprüft gegen
die Hilfeseiten der Anbieter am 2.10.2026 (docs/BETRIEB.md, „Mein
Postfach“). Alles bleibt in der Oberfläche änderbar; „Anderer Anbieter“
lässt die Felder leer.

Microsoft 365 fehlt mit Absicht: Exchange Online nimmt für IMAP kein
Passwort mehr an, nur OAuth — und das baut Rocket vorerst nicht (Kai,
2.10.2026). Wer ein solches Postfach einträgt, bekommt den Grund gesagt,
statt an einer Anmeldung zu scheitern, die nie gelingen kann.
"""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Anbieter:
    schluessel: str
    name: str
    imap_host: str
    imap_port: int
    smtp_host: str
    smtp_port: int
    smtp_sicherheit: str
    # Was die Person für die Anmeldung braucht, in einem Satz.
    hinweis: str


ANBIETER: tuple[Anbieter, ...] = (
    Anbieter(
        "google", "Google / Gmail", "imap.gmail.com", 993, "smtp.gmail.com", 465, "ssl",
        "Mit App-Passwort: Bestätigung in zwei Schritten muss an sein, das App-Passwort "
        "erzeugen Sie unter myaccount.google.com › Sicherheit. Ihr normales Passwort geht nicht.",
    ),
    Anbieter(
        "ionos", "IONOS", "imap.ionos.de", 993, "smtp.ionos.de", 465, "ssl",
        "Mit dem Passwort des Postfachs.",
    ),
    Anbieter(
        "strato", "Strato", "imap.strato.de", 993, "smtp.strato.de", 465, "ssl",
        "Mit dem Passwort des Postfachs aus dem Strato-Kundenbereich.",
    ),
    Anbieter(
        "onecom", "one.com", "imap.one.com", 993, "send.one.com", 465, "ssl",
        "Mit dem Passwort des Postfachs.",
    ),
)

EIGEN = "eigen"

# Woran man ein Microsoft-365-Postfach erkennt.
MICROSOFT_HOSTS = ("outlook.office365.com", "office365.com", "outlook.com", "hotmail.com", "live.com")

MICROSOFT_SATZ = (
    "Microsoft 365 und Outlook.com nehmen für IMAP kein Passwort mehr an, nur eine "
    "Freigabe über Microsoft. Die baut Rocket vorerst nicht."
)


def nach_schluessel(schluessel: str) -> Anbieter | None:
    return next((a for a in ANBIETER if a.schluessel == schluessel), None)


def ist_microsoft(host: str | None) -> bool:
    h = (host or "").strip().lower()
    return any(h == m or h.endswith("." + m) for m in MICROSOFT_HOSTS)


def als_liste() -> list[dict]:
    return [asdict(a) for a in ANBIETER]
