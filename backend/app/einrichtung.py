"""Die Erstinstallation — ein Code aus dem Datenordner statt eines Kopfes.

Bis 26.10.1 ließ Rocket im Modus `eigen`, solange niemand ein Passwort
hatte, jeden herein, der den Kopf `X-Bfl-User` mitschickte. Das war als
Rettung gedacht (eine frische Installation wäre sonst eine Sackgasse),
und es war ein offenes Tor: Der Entrance ist `public`, den Kopf kann
jeder setzen, und der Name des Eigentümers steht in der Adresse der Box.

**Jetzt gilt dieselbe Hürde wie beim vergessenen Passwort: der Zugang zur
Box.** Solange niemand ein Passwort hat, liegt unter `/app/data` eine
Datei mit einem Code. Lesen kann sie nur, wer in der Dateien-App von
Olares angemeldet ist. Mit Code, Name und neuem Passwort richtet die
Anmeldeseite den ersten Zugang ein; danach ist die Datei weg, und die
Ausnahme gibt es nicht mehr.

Zwei Fälle, und die Datei nennt den richtigen:

- **Es gibt schon eine Eigentümerin ohne Passwort** — eine Box, die vor
  26.10.1 über den Kopf eingerichtet wurde (so Kais Box). Dann bekommt
  genau sie das Passwort, mit allem, was schon im Bestand liegt. Die
  Datei nennt ihren Zugang.
- **Die Datenbank ist leer.** Dann entsteht der Zugang mit dem Namen aus
  dem Formular, samt Organisation — und, wenn ein Abzug daneben liegt,
  mit dem zurückgespielten Bestand (`auth._einrichten`).

Wie bei `zuruecksetzen.py` ist die Datei der ganze Datensatz: keine
Tabelle, nichts, was ein zurückgespielter Abzug wiederbeleben könnte.
Anders als dort läuft der Code nicht nach einer Viertelstunde ab — eine
Installation wird oft erst Tage später eingerichtet, und solange niemand
ein Passwort hat, ist die Box ohnehin noch nicht in Gebrauch. Er gilt,
bis er eingelöst ist; ein Neustart behält ihn.
"""

from __future__ import annotations

import hmac
import os
import pathlib
import re

from app.config import settings
from app.zuruecksetzen import ORDNER_IN_DATEIEN, code_neu

DATEI = "rocket-einrichten.txt"

# Was als Name eines neuen Zugangs taugt: dieselbe Form, die Rocket für
# eingeladene Personen bildet („marc-bayer“), damit niemand mit Leer- oder
# Sonderzeichen in der Anmeldung hängen bleibt.
NAME_MUSTER = re.compile(r"^[a-z0-9][a-z0-9._-]{1,62}$")


def _pfad() -> pathlib.Path:
    return pathlib.Path(settings.app_data_dir) / DATEI


def wo_liegt_die_datei() -> str:
    """Der Klickweg in der Dateien-App von Olares."""
    return " › ".join((*ORDNER_IN_DATEIEN, DATEI))


# Der Code besteht nur aus 0–9 und A–F. Was in der Dateien-App wie eine
# Ziffer aussieht, aber als Buchstabe getippt wird, zählt als die Ziffer:
# O, I und L kommen im Code nie vor, die Angleichung kann also nichts
# Falsches passend machen (Kai, 1.10.2026: „der Code funktioniert nicht“).
_GLEICH_AUSSEHEND = str.maketrans({"O": "0", "I": "1", "L": "1"})


def _blank(code: str) -> str:
    return "".join(z for z in code if z.isalnum()).upper().translate(_GLEICH_AUSSEHEND)


def befund(code: str) -> str:
    """Was beim Fehlversuch ins Pod-Log geht — nie der Code selbst.

    Genug, um von außen zu sehen, woran es lag: keine Datei, falsche
    Länge, fremde Zeichen (etwa eine eingefügte Adresse) oder schlicht
    ein anderer Code.
    """
    gelesen = _lesen()
    eingabe = _blank(code)
    teile = [
        f"Datei {'da' if gelesen else 'fehlt'} ({_pfad()})",
        f"{len(eingabe)} Zeichen eingegeben, 12 erwartet",
    ]
    if any(z not in "0123456789ABCDEF" for z in eingabe):
        teile.append("Zeichen außerhalb von 0–9/A–F")
    return "; ".join(teile)


def _lesen() -> tuple[str | None, str] | None:
    """Zugang (falls vorgegeben) und Code aus der Datei — oder nichts."""
    try:
        zeilen = _pfad().read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    felder: dict[str, str] = {}
    for zeile in zeilen:
        if ":" in zeile:
            schluessel, _, wert = zeile.partition(":")
            felder.setdefault(schluessel.strip(), wert.strip())
    code = felder.get("Code", "")
    if not code:
        return None
    return (felder.get("Zugang") or None), code


def bereitstellen(vorhandener_zugang: str | None) -> str:
    """Legt die Datei an, wenn sie fehlt oder nicht mehr passt. Gibt den Code.

    Eine vorhandene Datei bleibt, solange sie denselben Zugang nennt —
    sonst wäre der Code, den jemand gerade abtippt, nach jedem Neustart
    ein anderer. Zurückgegeben wird er nur für Tests, nie an den Browser.
    """
    gelesen = _lesen()
    if gelesen is not None and gelesen[0] == vorhandener_zugang:
        return gelesen[1]

    code = code_neu()
    kopf = "Rocket einrichten\n=================\n\n"
    if vorhandener_zugang:
        teil = (
            f"Zugang: {vorhandener_zugang}\n"
            f"Code:   {code}\n\n"
            "Auf der Anmeldeseite von Rocket unter „Rocket einrichten“ diesen\n"
            "Zugang, den Code und ein neues Passwort eingeben. Der Bestand,\n"
            "der schon in Rocket liegt, bleibt dabei erhalten.\n"
        )
    else:
        teil = (
            f"Code:   {code}\n\n"
            "Auf der Anmeldeseite von Rocket unter „Rocket einrichten“ den Code,\n"
            "einen Namen für Ihren Zugang (z. B. vorname-nachname) und ein\n"
            "Passwort eingeben. Sie werden damit Eigentümerin bzw. Eigentümer\n"
            "dieser Rocket-Installation und laden danach Ihr Team ein.\n"
        )
    fuss = (
        "\nDer Code gilt, bis Rocket eingerichtet ist; danach verschwindet diese\n"
        "Datei. Nur wer an diese Box kommt, kann sie lesen — geben Sie den\n"
        "Code niemandem weiter.\n"
    )
    ziel = _pfad()
    ziel.parent.mkdir(parents=True, exist_ok=True)
    # 0600 von Anfang an, wie bei der Rücksetzdatei.
    kennung = os.open(ziel, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(kennung, "w", encoding="utf-8") as datei:
        datei.write(kopf + teil + fuss)
    return code


def stimmt(code: str) -> bool:
    """Passt der Code? Zeitkonstant verglichen."""
    gelesen = _lesen()
    if gelesen is None:
        return False
    return hmac.compare_digest(_blank(gelesen[1]), _blank(code))


def verbrauchen() -> None:
    _pfad().unlink(missing_ok=True)
