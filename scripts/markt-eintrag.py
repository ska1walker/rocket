#!/usr/bin/env python3
"""Baut den Rocket-Eintrag im Markt (bayerhazard/aimighty-market).

Was bisher von Hand in jeder Sitzung geschah (docs/MARKT.md), an einer
Stelle:

- `functions/_apps.ts`: Version des Rocket-Eintrags, vorn in
  `upgradeDescription` die Notizen jeder Version, die der Markt noch nicht
  kennt (`olares/markt/<version>.md`). Kam ein Eintrag nie an, reist seine
  Notiz mit dem nächsten — Regel 5 in MARKT.md.
- `functions/_lib.ts`: der Chart-Schlüssel `rocket-<version>.tgz` mit dem
  frisch kodierten Release-Anhang, alte Rocket-Schlüssel entfernt, und
  `CANONICAL_EPOCH_MS` streng über dem Wert auf main.

Aufruf (aus der Action `markt.yml` oder von Hand):

    python3 scripts/markt-eintrag.py --markt <klon> --chart rocket-26.10.7.tgz \
        --version 26.10.7 --notizen olares/markt --pr-text pr.md

Gibt auf stdout den Titel des PR aus. Bricht ab, wenn eine Stelle nicht so
aussieht wie erwartet — lieber kein Eintrag als ein halber.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
import sys
from pathlib import Path


def version_tupel(v: str) -> tuple[int, ...]:
    return tuple(int(t) for t in v.split("."))


def notiz_lesen(datei: Path) -> tuple[str, str]:
    """`# Titel` in der ersten Zeile, danach ein Absatz, der mit `v<version>:` beginnt."""
    zeilen = datei.read_text(encoding="utf-8").strip().splitlines()
    if not zeilen or not zeilen[0].startswith("# "):
        raise SystemExit(f"{datei}: erste Zeile muss '# <Titel>' sein")
    titel = zeilen[0][2:].strip()
    text = " ".join(z.strip() for z in zeilen[1:] if z.strip())
    version = datei.stem
    if not text.startswith(f"v{version}: "):
        raise SystemExit(f"{datei}: der Text muss mit 'v{version}: ' beginnen")
    if "`" in text or "${" in text:
        raise SystemExit(f"{datei}: kein Backtick und kein '${{' — der Text steht in einem Template-String")
    return titel, text


def rocket_block(apps: str) -> tuple[int, int]:
    anfang = apps.index('name: "rocket"')
    ende = apps.index("spec: {", anfang)
    return anfang, ende


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--markt", type=Path, required=True)
    a.add_argument("--chart", type=Path, required=True)
    a.add_argument("--version", required=True)
    a.add_argument("--notizen", type=Path, required=True)
    a.add_argument("--pr-text", type=Path)
    arg = a.parse_args()

    v = arg.version
    apps_datei = arg.markt / "functions" / "_apps.ts"
    lib_datei = arg.markt / "functions" / "_lib.ts"
    apps = apps_datei.read_text(encoding="utf-8")
    lib = lib_datei.read_text(encoding="utf-8")

    # ── _apps.ts ──────────────────────────────────────────────────────────
    anfang, ende = rocket_block(apps)
    block = apps[anfang:ende]
    m = re.search(r'version: "([0-9.]+)"', block)
    if not m:
        raise SystemExit("_apps.ts: keine Rocket-Version gefunden")
    alt = m.group(1)
    if version_tupel(alt) >= version_tupel(v):
        print(f"Markt hat Rocket {alt}, nichts zu tun für {v}", file=sys.stderr)
        raise SystemExit(3)

    neue = sorted(
        (d for d in arg.notizen.glob("*.md") if version_tupel(alt) < version_tupel(d.stem) <= version_tupel(v)),
        key=lambda d: version_tupel(d.stem),
        reverse=True,
    )
    if not neue or neue[0].stem != v:
        raise SystemExit(f"Notiz {arg.notizen}/{v}.md fehlt")
    notizen = [notiz_lesen(d) for d in neue]
    titel = notizen[0][0]
    texte = " ".join(t for _, t in notizen)

    block = block.replace(f'version: "{alt}"', f'version: "{v}"', 1)
    m = re.search(r"upgradeDescription:\s*\n\s*`", block)
    if not m:
        raise SystemExit("_apps.ts: upgradeDescription nicht gefunden")
    block = block[: m.end()] + texte + " " + block[m.end():]
    apps = apps[:anfang] + block + apps[ende:]

    # ── _lib.ts ───────────────────────────────────────────────────────────
    roh = arg.chart.read_bytes()
    if roh[:2] != b"\x1f\x8b":
        raise SystemExit("Chart ist kein gzip")
    b64 = base64.b64encode(roh).decode()
    schluessel = list(re.finditer(r'\n\s*"rocket-[0-9.]+\.tgz": "[A-Za-z0-9+/=]+",?', lib))
    if len(schluessel) != 1:
        raise SystemExit(f"_lib.ts: {len(schluessel)} Rocket-Schlüssel statt einem")
    k = schluessel[0]
    komma = "," if k.group(0).endswith(",") else ""
    einrueck = re.match(r"\n(\s*)", k.group(0)).group(1)
    lib = lib[: k.start()] + f'\n{einrueck}"rocket-{v}.tgz": "{b64}"{komma}' + lib[k.end():]

    m = re.search(r"const CANONICAL_EPOCH_MS = (\d+);", lib)
    if not m:
        raise SystemExit("_lib.ts: CANONICAL_EPOCH_MS nicht gefunden")
    epoch_alt = int(m.group(1))
    epoch_neu = (epoch_alt // 1_000_000_000 + 1) * 1_000_000_000
    lib = lib[: m.start(1)] + str(epoch_neu) + lib[m.end(1):]

    apps_datei.write_text(apps, encoding="utf-8")
    lib_datei.write_text(lib, encoding="utf-8")

    sha = hashlib.sha256(roh).hexdigest()
    if arg.pr_text:
        arg.pr_text.write_text(
            "\n".join(
                [
                    f"Rocket {alt} → {v}, gebaut von der Action `markt.yml` im Rocket-Repo nach dem Release.",
                    "",
                    f"- `functions/_apps.ts`: Version {alt} → {v}, Notiz{'en' if len(neue) > 1 else ''} "
                    + ", ".join(d.stem for d in neue)
                    + " vorn in `upgradeDescription`.",
                    f"- `functions/_lib.ts`: `rocket-{v}.tgz` (Release-Anhang, sha256 `{sha}`), "
                    f"`CANONICAL_EPOCH_MS` {epoch_alt} → {epoch_neu}.",
                    "",
                    "Vor dem PR lokal mit wrangler bewiesen: Hash, Chart byte-gleich, Detail mit Version und chartName.",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
    print(f"rocket {v}: {titel}")


if __name__ == "__main__":
    main()
