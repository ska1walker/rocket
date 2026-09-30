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
| Beitragsweg | Fork (`ska1walker/aimighty-market`) → Branch → PR an `bayerhazard/aimighty-market`, nie direkt auf `main` |
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
| **Versionsschema `YY.M.<n>`** (z. B. `26.9.1`) | ✗ Rocket zählt SemVer `0.x.y` — siehe „Abweichungen" |
| **Entrances `authLevel: internal`** | ✗ bewusst `public` — siehe „Abweichungen" |
| **„Kein gesetzter Markenname / kein Logo"** | ✗ Rocket zeigt die AImighty-Wortmarke oben links — siehe „Abweichungen" |

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

## Abweichungen — zu entscheiden

1. **Versionsschema.** Der Markt nennt `YY.M.<n>` (September 2026 =
   `26.9.x`). Rocket zählt `0.14.0`. SemVer `0.x.y` ist gültig und kommt
   durch den Linter; ein Wechsel auf `26.9.x` wäre ein Sprung nach oben
   und damit als Update möglich. Offen, ob der Markt das verlangt oder nur
   für die eigenen Modell-Apps so hält.
2. **`authLevel: public`.** Der Markt nennt `internal`. Rocket braucht
   `public`, weil ein Team sich sonst keinen Bestand teilen kann und die
   Mail-Links von außen erreichbar sein müssen; Rocket meldet selbst an
   (BETRIEB.md „Anmeldung"). Bleibt so.
3. **Wortmarke.** Der Markt sagt „kein gesetzter Markenname / kein Logo".
   Rocket zeigt seit 0.1.4 die AImighty-Wortmarke oben links
   (`frontend/components/marke.tsx`). Offen, ob die Regel für Rocket gilt.

Nicht übernommen, weil für Rocket ohne Belang: Titelschema
`AIM <Modell> <Größe> <Aufgabe>`, Beschreibungsvorlage für Modelle,
GPU-/Engine-Regeln, `check-auth`-Sidecar-Umbau, Marcs Arbeitsumgebung
(Alpine-Pod, Pfade, Docker-Eigenheiten).
