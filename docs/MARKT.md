# Rocket im AImighty-Markt

> **Quelle:** `AGENTS.md` und `AGENTS2.md` aus dem Workspace von Marc
> (Stand 30.9.2026), abgeglichen mit diesem Repo am 30.9.2026. Hier steht
> nur, was Rocket betrifft. Zugangsdaten (`.secrets.md`, Cloudflare-Token,
> PAT) gehören **nie** in dieses Repo.
>
> Der Ablauf für eine Veröffentlichung steht in `docs/BETRIEB.md`,
> „Veröffentlichen"; diese Datei ergänzt ihn um die Regeln des Markts.

## Die Kette

```
Git (bayerhazard/aimighty-market, functions/)
  → GitHub Action deployt nach Cloudflare Pages (aimighty-market.pages.dev)
  → Olares synct alle 5 Minuten über den Hash
  → Katalog / Installation / Update auf der Box
```

| Zweck | Wert |
|---|---|
| Market-Source-Repo | `bayerhazard/aimighty-market` — nur `functions/` anfassen |
| Beitragsweg | Fork (`ska1walker/aimighty-market`) → Branch → PR an `bayerhazard/aimighty-market`, nie direkt auf `main`; Kai hat Schreibrechte und kann selbst mergen |
| Kanonische Adresse | `https://aimighty-market.pages.dev` |
| Vorschau eines Deploys | `https://<hash>.aimighty-market.pages.dev` — sofort aktuell, die kanonische Adresse cacht 1–2 Minuten |
| Market-Source-ID in Olares | `market.AImighty` |

Drei Ebenen können auseinanderliegen und werden immer abgeglichen: Git
(`_apps.ts`, `_lib.ts`), das Deployment auf Cloudflare und der Katalog in
Olares (`olares-cli market get rocket -s market.AImighty`).

## Was der Markt verlangt — und wie Rocket dasteht

| Regel des Markts | Rocket |
|---|---|
| `apiVersion: 'v3'`, `olaresManifest.version: '0.12.0'` | ✓ |
| `workloadReplicas` auf oberster Ebene, `replicas` aus `.Values.workloads.<name>.replicaCount` | ✓ (`rocket`, `rocket-backend`, `rocket-links`) |
| `options.dependencies`: `olares >=1.12.6-0` | ✓ |
| `metadata.name` = Chart-Name = `entrance.name`/`host` = K8s-Namen, **nie umbenennen** | ✓ `rocket` — die Umbenennung von Beacon war deshalb eine Neuinstallation |
| Root-`OlaresManifest.yaml` identisch mit dem im Chart | ✓ (`check-chart.sh` prüft es) |
| Entrance mit `openMethod: window` (sonst „running" statt „open") | ✓ |
| Kategorien nur AI / Audio / Utilities | ✓ AI |
| Beschreibungen englisch | ✓ |
| Version an **5 Stellen** gleich: `_apps.ts`, `_lib.ts`-Schlüssel `rocket-<version>.tgz`, `Chart.yaml`, Manifest `metadata.version` und `spec.versionName` | im Repo 3 Stellen (BETRIEB.md), im Markt 2 weitere |
| Farben Hanseatenblau `#051729` + Gold `#caa960`, Geist selbst gehostet, `--am-*`, WCAG 2.2 AA | ✓ (`--am-blau-900`, `--am-gold-500`) |
| Versionsschema `YY.M.<n>` (z. B. `26.9.1`) | ✓ seit 26.9.1, `check-chart.sh` prüft es |
| Entrances `authLevel: internal` | **Ausnahme:** `public` — siehe „Entschieden" |
| „Kein gesetzter Markenname / kein Logo" | **Ausnahme:** AImighty-Wortmarke bleibt — siehe „Entschieden" |

## Regeln, die bei jedem Markt-PR gelten

- **Jede Änderung braucht eine neue Version** — auch reine Texte,
  Kategorien oder Titel. Der Hash entsteht nur aus `ID:name:version`;
  ohne Versionssprung synct Olares nicht.
- **Chart frisch packen und frisch base64-kodieren**, nie einen alten
  base64-Text wiederverwenden (sonst Cloudflare-Fehler 1101). Nur **einmal**
  gzip — die rohe Ausgabe von `helm package` (doppelt gezippt ergibt
  `invalid tar header`).
- **Veraltete Chart-Schlüssel** in `_lib.ts` entfernen, nur die aktuelle
  Version behalten.
- Beim Einfügen in `CHARTS` auf das Ende achten (`,\n};` gegen `\n};`) —
  ein doppeltes Komma bricht den Build.
- `chartName` im Detail = `"rocket-<version>.tgz"` = Schlüssel in `CHARTS`,
  sonst 404 und Olares bleibt auf der alten Version.
- `node_modules/` und `.wrangler/` nie committen.
- Vor dem PR lokal beweisen (`npx wrangler pages dev functions --port 8788`,
  siehe BETRIEB.md), nach dem Merge an der Vorschau-Adresse prüfen.

## Befehle auf der Box

```bash
olares-cli market get rocket -s market.AImighty        # Stand im Katalog
olares-cli market upgrade rocket --watch               # Update einspielen
olares-cli market install rocket -s market.AImighty --watch
```

- `market upgrade` meldet „app is not installed", wenn vorher
  deinstalliert wurde — dann `install`.
- `market download` liefert HTTP 501, Charts kommen aus Repo oder Markt.
- `olares-cli cluster … exec` braucht Olares ≥ 1.12.7; die Box läuft
  (Stand 30.9.) mit Backend 1.12.6. `kubectl` gibt es in Marcs Umgebung
  nicht — Eingriffe laufen über ein neues Chart mit neuer Version.

### Eigene Adresse (Route-ID)

Die Adresse `https://fdfedc010.<nutzer>.olares.de` lässt sich um einen
Alias ergänzen — beide gelten danach, ein Zertifikat ist nicht nötig:

```bash
olares-cli settings apps domain set rocket rocket --third-level rocket
```

Das geht **nur nach der Installation**, nicht im Chart. Noch nicht
ausprobiert; wenn gesetzt, in BETRIEB.md festhalten und prüfen, ob die
öffentlichen Mail-Links (`rocketlinks`, `APP_DOMAIN`) davon unberührt
bleiben.

## Wie Claude einen Markt-PR anlegt

Eine Rocket-Sitzung kann Marcs Repo nicht selbst einbinden: Sie hat den
Fork `ska1walker/aimighty-market` schon, und zwei gleichnamige Repos
passen nicht in eine Sitzung. Deshalb:

1. Die Rocket-Sitzung baut den Eintrag im Fork (Branch `rocket-<version>`,
   Chart = Anhang des GitHub-Release, lokal mit wrangler bewiesen) und
   pusht ihn.
2. Sie startet eine **zweite Sitzung** mit `bayerhazard/aimighty-market`
   als Quelle — in der Umgebung **„Standard"**. Die Umgebung „Rocket"
   bricht dort im Einrichtungsskript ab (30.9.2026), weil es auf das
   Rocket-Repo zugeschnitten ist.
3. Die zweite Sitzung legt den PR an und merged ihn. Fragt sie vorher
   nach Bestätigung, antwortet Kai dort einmal (eine Nachricht aus der
   Rocket-Sitzung dorthin geht nicht).
4. Die Rocket-Sitzung prüft danach selbst über `git fetch` von
   `bayerhazard/aimighty-market`, ob der Eintrag auf `main` steht und
   das Chart byte-gleich ist. `aimighty-market.pages.dev` ist aus den
   Sitzungen nicht erreichbar — den Katalog prüft Kais Box.

Erster Durchlauf: Rocket 26.9.1, PR #81, 30.9.2026 — von Kai im Katalog der Box bestätigt, installiert und laufend.

Zweiter Durchlauf: Rocket 26.9.4, PR #83, 30.9.2026 — Fork-Branch `rocket-26.9.4`, lokal mit wrangler bewiesen, von der Standard-Sitzung gemergt, auf `main` byte-gleich geprüft (sha256 `80137700…dd099`). Überspringt 26.9.2 und 26.9.3; das Update von 26.9.1 spielt die Migrationen 0033–0035 beim Start ein.

## Bekannte Fallen im Markt

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Katalog zeigt alte Version, API die neue | `CHARTS`-Schlüssel ≠ Version in `_apps.ts` | Schlüssel angleichen |
| Olares synct nicht | Version nicht erhöht, oder Cache-Fehler im Markt | Version erhöhen |
| Chart-Download 500 (Cloudflare 1101) | base64 kaputt | Chart neu packen, frisch kodieren |
| „render failed", App hängt in der Fehlerliste | kein automatischer Neuversuch | Version erhöhen |
| `sync-app` HTTP 500 „render failed or timed out" | meist nur ein Timeout | abwarten, rendert trotzdem |
| „Incompatible with your Olares" | Entrance-Name/-Host ≠ `metadata.name` | gleich benennen |
| Werte aus der Erstinstallation bleiben hängen | Olares friert `values.yaml` beim Upgrade ein | kritische Werte im Template festschreiben (Rocket: Image-Tag über `.Chart.AppVersion`, `ANMELDUNG_MODUS` als Literal) |
| Katalog zeigt entfernte App weiter | Olares-Cache | Market-Source im UI entfernen und neu hinzufügen |

App-zu-App auf derselben Box geht über die **Entrance-Adresse** der
Ziel-App; Cluster-DNS-Namen sind nicht erreichbar. Das deckt sich mit der
Messung bei Insilo (BETRIEB.md, 15.9.2026).

## Entschieden (Kai, 30.9.2026)

1. **Versionsschema `YY.M.<n>`.** Rocket startet im Markt als neue App und
   übernimmt das Schema gleich: erste Version `26.9.1`, im Oktober
   `26.10.1`. Bis 0.13.0 zählte Rocket `0.x.y`; 0.14.0 wurde nie
   veröffentlicht. Die erste Zeile der `upgradeDescription` beginnt wie
   im Markt üblich mit `v26.9.1: …` und endet mit „Built for Olares
   1.12.6."
2. **`authLevel: public` bleibt** — eine wichtige Ausnahme. Ohne sie
   könnte sich kein Team einen Bestand teilen, und die Links in Mails
   wären von außen nicht erreichbar; Rocket meldet selbst an
   (BETRIEB.md „Anmeldung").
3. **Die AImighty-Wortmarke bleibt** oben links
   (`frontend/components/marke.tsx`).

Nicht übernommen, weil für Rocket ohne Belang: Titelschema
`AIM <Modell> <Größe> <Aufgabe>`, Beschreibungsvorlage für Modelle,
GPU-/Engine-Regeln, `check-auth`-Sidecar-Umbau, Marcs Arbeitsumgebung
(Alpine-Pod, Pfade, Docker-Eigenheiten).
