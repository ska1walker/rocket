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
| Market-Source-ID in Olares | `market.aimighty` (klein, seit 6.10.2026; Groß- und Kleinschreibung zählen) |

Drei Ebenen können auseinanderliegen und werden immer abgeglichen: Git
(`_apps.ts`, `_lib.ts`), das Deployment auf Cloudflare und der Katalog in
Olares (`olares-cli market get rocket -s market.aimighty`).

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

## Der Markt bewegt sich auch ohne uns

Marc veröffentlicht im selben Repo eigene Apps und ändert den Markt
selbst — am 30.9.2026 zum Beispiel, wie `_lib.ts` die Änderungszeit der
Apps rechnet (`appModifyTime` nach Deploy-Zeitpunkt statt nach Version).
Ein Rocket-Eintrag, der auf einem älteren `main` gebaut ist, kann dadurch
veraltet sein, ohne dass Git einen Konflikt meldet. Deshalb gilt
**vor jedem Markt-Eintrag** (festgelegt von Kai am 30.9.2026):

1. **`upstream/main` frisch holen und den Zweig darauf bauen**, nie auf
   einem Zweig eines früheren Eintrags oder einem alten Stand.
2. **Nachlesen, was sich seit dem letzten Rocket-Eintrag geändert hat**
   (`git log` und `git diff` auf `functions/` seit dem letzten
   `rocket`-Commit). Betrifft es mehr als fremde App-Einträge — `_lib.ts`,
   die API unter `functions/api/`, Felder in `_apps.ts`, Regeln in
   `CLAUDE.md` des Markt-Repos —, dann erst verstehen, ob Rocket etwas
   nachziehen muss, und das hier unter den Regeln festhalten.
3. **Mit wrangler gegen genau diesen Stand beweisen**, nicht gegen den
   vom letzten Mal.
4. **Unmittelbar vor dem Merge erneut prüfen**, ob `main` weitergelaufen
   ist; wenn ja, konfliktfrei (`git merge-tree`) und die Änderung
   verstanden, sonst neu aufbauen.
5. Ist ein Rocket-Eintrag nicht durchgekommen und ein neuer folgt, **baut
   der neue auf `main` auf und nimmt den alten in seine Notizen mit** —
   den alten Zweig nicht nachträglich einreichen.

## Der Weg in den Markt: die Action `markt.yml` (seit 26.10.7)

**Ein Release geht ohne Handgriff in den Markt.** Entschieden von Kai am
1.10.2026 („ganz automatisch“): Der Weg über eine eigene Sitzung je Release
dauerte zu lange — Claude baute den Eintrag von Hand, Kai startete eine
Sitzung und fügte den Auftrag ein, die Sitzung fragte manchmal zurück,
danach prüfte Claude nach. Jetzt läuft nach jedem erfolgreichen `release`
auf `main` die Action `.github/workflows/markt.yml`:

1. holt den Chart-Anhang des Release und **Marcs `main` frisch**;
2. baut den Eintrag mit `scripts/markt-eintrag.py`: Version, Kategorien aus
   `olares/OlaresManifest.yaml`, Notizen vorn in `upgradeDescription`, Chart-Schlüssel frisch kodiert, alte Rocket-Schlüssel
   weg, `CANONICAL_EPOCH_MS` streng darüber. Kennt der Markt die Version
   schon, endet sie still;
3. **beweist ihn mit wrangler** (`scripts/markt-beweis.sh`: Hash, Chart
   byte-gleich, Version und `chartName`);
4. pusht den Zweig `rocket-<version>` in den Fork, prüft, dass `main` sich
   seit dem Bau nicht bewegt hat (sonst bricht sie ab — einfach neu starten),
   öffnet den PR und **mergt ihn** (Squash, wie bisher);
5. prüft auf `main`, dass genau `rocket-<version>.tgz` byte-gleich dasteht,
   und wartet den Cloudflare-Deploy ab.

Im PR steht, was Marc seit dem letzten Rocket-Eintrag an `functions/`
geändert hat — so bleibt Regel 2 aus „Der Markt bewegt sich auch ohne uns“
sichtbar, auch ohne Sitzung. Bricht etwas, ist der Lauf rot und nichts ist
gemergt.

**Die Notiz schreibt der Release-PR.** Je Version eine Datei
`olares/markt/<version>.md`: erste Zeile `# <kurzer Titel>` (wird
„rocket <version>: <Titel>“), darunter Englisch, beginnend mit
`v<version>: `, ohne Backtick; nach einer Zeile `## Deutsch` derselbe Text auf
Deutsch, ebenfalls ab `v<version>: ` (seit 26.10.8, Kai, 1.10.2026: Der Markt
zeigt Rocket auch auf Deutsch, wie Marcs Apps).

**Die Beschreibung im Markt** steht ebenfalls hier, in
`olares/markt/beschreibung.de.md` und `beschreibung.en.md` (`# Kurz`, eine
Zeile; `# Beschreibung`, Markdown). Die Action schreibt sie bei jedem Eintrag
als `{ en, de }` in Marcs `_apps.ts`; der Markt wählt die Sprache der Box
(`loc()` in `_lib.ts`, `de-DE`). Ältere Notizen ohne deutschen Teil stehen im
Deutschen auf Englisch. `scripts/check-chart.sh` fehlt sie, und der PR
ist rot — die Notiz wird mit dem Code gelesen, nicht am Ende erfunden. Kam
eine Version nie im Markt an, nimmt die nächste ihre Notiz mit.

**Das Geheimnis `MARKT_TOKEN`** (Rocket-Repo › Settings › Secrets and
variables › Actions) legt Kai selbst an, Claude sieht es nie: ein *classic*
Personal Access Token von `ska1walker` mit dem Bereich `repo` — ein
fein granuliertes Token reicht nicht über zwei Eigentümer (Fork und Marcs
Repo). Es braucht Schreibrecht im Fork und in `bayerhazard/aimighty-market`.
Läuft es ab, sagt die Action das; ohne Token tut sie nichts und meldet, dass
der Eintrag von Hand geht.

**Von Hand nachholen:** Actions › markt › *Run workflow*, Version eintragen.

**Damit entfällt:** „erst nach einer laufenden Installation auf einer Box“.
Kai hatte die Regel seit 26.9.5 mehrfach bewusst übergangen; geprüft wird
jetzt vor dem Merge in Rocket (CI mit Rundgang im Browser) und vor dem
Eintrag (wrangler), nicht mehr auf der Box.

## Früher: Kai startet die Sitzung (bis 26.10.6, Rückfallweg ohne Token)

### Wer den PR in Marcs Repo öffnet und mergt: Kai startet die Sitzung

Claude bereitet alles vor — Zweig im Fork auf frischem `upstream/main`,
Zeitstempel, Chart, wrangler-Beweis — und gibt Kai einen fertigen Auftrag.
**Kai startet die Markt-Sitzung selbst** (Umgebung „Standard“, Quelle
`bayerhazard/aimighty-market`) und fügt den Auftrag ein. Festgelegt von Kai
am 1.10.2026.

Warum: Eine Sitzung, die Claude anlegt, wertet eine Freigabe, die über
Claude kommt, nicht als Kais eigene. Bei 26.9.6, 26.9.7 und 26.10.2 hielt
sie deshalb vor dem PR an und fragte nach; bei 26.10.1 nicht — verlässlich
war das nie. Startet Kai die Sitzung, kommt der Auftrag von ihm, und sie
arbeitet durch. Claude verfolgt danach `upstream/main`, prüft den Chart dort
byte-gleich und trägt den Durchlauf hier ein.

Die Vorlage (Claude füllt Version, Commit, Basis, Prüfsumme und Zeitstempel):

```
Bitte öffne und merge einen Pull Request in bayerhazard/aimighty-market
für Rocket <VERSION>.

Vorbereitet im Fork ska1walker/aimighty-market, Zweig `rocket-<VERSION>`,
Commit <SHA>, ein Commit auf main <BASIS>. Er ändert nur:
- functions/_apps.ts: rocket-Version <ALT> -> <VERSION>, neuer Absatz vorn
  in upgradeDescription.
- functions/_lib.ts: CHARTS-Schlüssel `rocket-<ALT>.tgz` ersetzt durch
  `rocket-<VERSION>.tgz` (base64 des Release-Anhangs
  https://github.com/ska1walker/rocket/releases/download/v<VERSION>/rocket-<VERSION>.tgz,
  sha256 <PRÜFSUMME>) und CANONICAL_EPOCH_MS <ALT_EPOCH> -> <NEU_EPOCH>.

1. Prüfen: nur diese zwei Dateien und nur diese Stellen; mergt sauber;
   Zeitstempel streng über dem auf main; sha256 des dekodierten Charts.
2. PR öffnen (Titel „rocket <VERSION>: <kurz>“), auf Checks warten, mergen
   wie im Repo üblich. Kein Rebase, kein Force-Push; bei Konflikt oder
   roter Prüfung nur berichten.
3. `merged: true` und den Cloudflare-Deploy auf main bestätigen, in drei
   bis fünf Zeilen berichten.
```

## Regeln, die bei jedem Markt-PR gelten

- **`CANONICAL_EPOCH_MS` in `functions/_lib.ts` hochzählen** — streng über
  den Wert auf `main`. Seit Ende September 2026 tragen alle Apps denselben
  Deploy-Zeitstempel, und die Box synct nur, was über ihrer höchsten
  bekannten Marke liegt. Ohne Sprung kann die neue Version unbemerkt
  liegen bleiben. Rocket 26.9.7 kam ohne an, weil Marc danach selbst
  hochzählte; 26.10.1 zählt von 4373000000000 auf 4374000000000.

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
olares-cli market get rocket -s market.aimighty        # Stand im Katalog
olares-cli market upgrade rocket --watch               # Update einspielen
olares-cli market install rocket -s market.aimighty --watch
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

Zweiter Durchlauf: Rocket 26.9.4, PR #83, 30.9.2026 — Fork-Branch `rocket-26.9.4`, lokal mit wrangler bewiesen, von der Standard-Sitzung gemergt, auf `main` byte-gleich geprüft (sha256 `80137700…dd099`). Überspringt 26.9.2 und 26.9.3; das Update von 26.9.1 spielt die Migrationen 0033–0035 beim Start ein. Von Kai auf der Box aktualisiert und laufend bestätigt (30.9.2026) — das erste Update über den Markt, nicht nur eine Erstinstallation.

Dritter Durchlauf: Rocket 26.9.5, PR #84, 30.9.2026 — auf Kais Auftrag vor einer Installation auf der Box eingereicht (die Regel „erst nach laufender Installation" hat er damit bewusst übergangen). Fork-Branch `rocket-26.9.5`, alle vier Endpunkte lokal mit wrangler bewiesen, von der Standard-Sitzung gemergt, auf `main` byte-gleich geprüft (sha256 `e7f50cc2…6545d`). Keine Datenbankänderung gegenüber 26.9.4.

Vierter Durchlauf: Rocket 26.9.7, PR #85, 30.9.2026 — auf Kais Auftrag vor einer Installation auf der Box. Der Eintrag für 26.9.6 (Fork-Branch `rocket-26.9.6`) kam nie an, weil die Markt-Sitzung auf eine Bestätigung wartete; 26.9.7 baut auf Marcs frischem `main` auf (dort hatte sich inzwischen `appModifyTime` geändert) und nimmt 26.9.6 in die Notizen mit. Fork-Branch `rocket-26.9.7`, lokal mit wrangler bewiesen, in einer Standard-Sitzung erst nach Kais Bestätigung dort gemergt, auf `main` byte-gleich geprüft (sha256 `c471aed4…0931`, keine alten Schlüssel). Keine Datenbankänderung gegenüber 26.9.5.

Fünfter Durchlauf: Rocket 26.10.1, PR #86, 1.10.2026 — Einrichtungscode statt Olares-Kopf bei der Erstinstallation, Layout-Korrekturen. Nach der neuen Regel gebaut: Marcs `main` frisch geholt (2c5b31f), seine Änderungen seit 26.9.7 gelesen (Deploy-Zeitstempel für alle Apps, Kategorien kleingeschrieben, drei Apps entfernt, Relay und Wings nach „Utilities“) und daraufhin `CANONICAL_EPOCH_MS` auf 4374000000000 gehoben. Lokal mit wrangler bewiesen, diesmal ohne Rückfrage von der Standard-Sitzung gemergt, auf `main` byte-gleich geprüft (sha256 `45e77567…2710`, keine alten Schlüssel). Keine Datenbankänderung gegenüber 26.9.7.

Sechster Durchlauf: Rocket 26.10.2, PR #87, 1.10.2026 — Einrichtungscode fehlertolerant (O/I/L, Formprüfung vor dem Senden). Marcs `main` unverändert seit 26.10.1 (c35957f); `CANONICAL_EPOCH_MS` 4374000000000 → 4375000000000. Lokal mit wrangler bewiesen; die von Claude angelegte Sitzung hielt vor dem PR an und wartete auf Kai — Anlass für die Regel „Kai startet die Sitzung“. Auf `main` byte-gleich geprüft (sha256 `f03a5688…a253`, keine alten Schlüssel). Keine Datenbankänderung. Von Kai auf der Box aktualisiert; die Einrichtung mit dem Code für `kaivostudio` klappte, der Bestand blieb (1.10.2026).

Siebter Durchlauf: Rocket 26.10.3, PR #88, 1.10.2026 — Kontrast des gedämpften Texts (#567595), Kontrastprüfung in der CI. Marcs `main` unverändert seit 26.10.2 (d2c2a34); `CANONICAL_EPOCH_MS` 4375000000000 → 4376000000000. Lokal mit wrangler bewiesen; auf Kais Wunsch von Claude gestartet, diesmal ohne Rückfrage gemergt; auf `main` byte-gleich geprüft (sha256 `8529ee6e…f948`, keine alten Schlüssel). Keine Datenbankänderung. Von Kai auf der Box aktualisiert, läuft (1.10.2026).

Achter Durchlauf: Rocket 26.10.5, PR #89, 1.10.2026 — Token aus dem CI-Repo (`tokens/app.css`), vier Kontrastfehler behoben; enthält 26.10.4 (Einstellungsnavigation), das nie im Markt war. Marcs `main` hatte sich seit 26.10.3 bewegt (71568a6): vier eigene Einträge, dazu zwei Änderungen am Markt selbst — Beschreibungen dürfen je Sprache stehen (`loc()` in `_lib.ts`, auch `de-DE`), und die Kategorie „Applications“ steht vorn in der Navigation. Für Rocket ändert das nichts, ein einfacher englischer Text gilt weiter. `CANONICAL_EPOCH_MS` 4380000000000 → 4381000000000. Lokal mit wrangler bewiesen; auf Kais Wunsch von Claude gestartet, ohne Rückfrage gemergt; auf `main` byte-gleich geprüft (sha256 `b413f923…31c5`, keine alten Schlüssel). Keine Datenbankänderung. Von Kai auf der Box aktualisiert, läuft (1.10.2026).

Neunter Durchlauf: Rocket 26.10.7, PR #90, 1.10.2026 — **der erste ohne Sitzung**, gebaut, bewiesen und gemergt von der Action `markt.yml` drei Minuten nach dem Release (Merge 31d6b82, Cloudflare-Deploy grün). Nimmt 26.10.6 mit: Dessen Eintrag (Zweig `rocket-26.10.6`) kam nie an; Marc hatte inzwischen `main` bewegt (eigene Einträge mit deutschen Beschreibungen, Open Design entfernt) und den Zeitstempel selbst auf 4382000000000 gehoben — genau den Wert des ersten 26.10.6-Zweigs, der damit nicht mehr darüber lag. Die Action rechnete auf frischem `main` 4383000000000. Auf `main` byte-gleich geprüft (sha256 `ec4b3924…4d63`, keine alten Schlüssel). Keine Datenbankänderung.

Zehnter Durchlauf: Rocket 26.10.8, PR #91, 1.10.2026 — wieder von der Action, zwei Minuten nach dem Release: erstmals mit deutschen Texten (`{ en, de }` für Beschreibung und „Was ist neu“) und der Kategorie „Applications“ aus dem Manifest. Auf `main` byte-gleich geprüft (sha256 `9b6630ed…b307`, Zeitstempel 4384000000000). Keine Datenbankänderung.

Elfter Durchlauf: Rocket 26.10.9, PR #92, 1.10.2026 — von der Action: jedes Symbol aus dem CI-Set (HB-SYMBOL). Marc hatte `main` seit 26.10.8 bewegt (eigene App `aimqwen3asr`) und den Zeitstempel selbst auf 4385000000000 gehoben; die Action rechnete auf frischem `main` 4386000000000. Auf `main` byte-gleich geprüft (sha256 `e05c3747…808a`, keine alten Schlüssel). Keine Datenbankänderung.

Zwölfter Durchlauf: Rocket 26.10.10, PR #93, 1.10.2026 — von der Action: Rollenzeichen an der Produktleiter, „lokal“ im Nachweis. Marc hatte `main` seit 26.10.9 wieder bewegt und den Zeitstempel weiter gehoben; die Action rechnete auf frischem `main` 4389000000000. Auf `main` byte-gleich geprüft (sha256 `7659ec4c…e793`, keine alten Schlüssel). Keine Datenbankänderung.

Dreizehnter Durchlauf: Rocket 26.10.11, PR #94, 1.10.2026 — von der Action, drei Minuten nach dem Release: Token, Zeichen und Bausteine aus dem CI-Stand `ci-26.10.2` (Paket 4), Suchfeld auf der Linie der Seite. Marcs `main` unverändert seit 26.10.10; die Action rechnete 4390000000000. Gleich danach hat Marc eine eigene App aktualisiert und den Zeitstempel auf 4391000000000 gehoben — Rockets Schlüssel blieb dabei unberührt. Auf `main` byte-gleich geprüft (sha256 `453e6639…a581`, keine alten Schlüssel). Keine Datenbankänderung.

Vierzehnter Durchlauf: Rocket 26.10.12, PR #95, 1.10.2026 — von der Action: React #418 behoben (Symbole selbst im `<head>`, keine Icon-Marke von Next mehr). Marc hatte `main` seit 26.10.11 zweimal bewegt (eigene App `aimllmgemma4vllm`, Zeitstempel auf 4391000000000); die Action rechnete auf frischem `main` 4392000000000. Auf `main` byte-gleich geprüft (sha256 `835eeb7f…e0c3`, keine alten Schlüssel). Keine Datenbankänderung.

Fünfzehnter Durchlauf: Rocket 26.10.13, PR #96, 1.10.2026 — von der Action, zwei Minuten nach dem Release: Dichteschalter (Weit/Normal/Kompakt). Marc hatte `main` seit 26.10.12 bewegt (eigene App `aimllmgemma4vllm`, Zeitstempel als globale Höchstmarke auf 4400000000000); die Action rechnete auf frischem `main` 4401000000000. Auf `main` byte-gleich geprüft (sha256 `5d2b6b5d…3455`, keine alten Schlüssel). Keine Datenbankänderung. Kai hat seine Box am selben Abend von 26.10.7 direkt auf 26.10.13 aktualisiert; läuft.

Sechzehnter Durchlauf: Rocket 26.10.14, PR #97, 2.10.2026 — von der Action: API-Schlüssel, mit denen Programme von außen die Eigenschaften pflegen. Marc hatte `main` seit 26.10.13 bewegt (eigene App `aimqwen38llama`, Zeitstempel weiter gehoben); die Action rechnete auf frischem `main` 4404000000000. Auf `main` byte-gleich geprüft (sha256 `8221fd45…bb2b`, keine alten Schlüssel). Neue Tabelle `api_schluessel` (Migration 0036), vorhandene Daten unverändert.

Siebzehnter Durchlauf: Rocket 26.10.15, PR #98, 2.10.2026 — von der Action: Sicht nach Zuordnung, das Fundament von Stufe 3 (eingeschränkte Sicht, Zugriff auf Firmen und Bereiche, `viewer` liest nur). `main` hatte sich seit 26.10.14 nicht bewegt; Zeitstempel 4405000000000. Auf `main` byte-gleich geprüft (sha256 `1ba53c86…9e05`, keine alten Schlüssel). Migration 0037 mit vier neuen Tabellen und einer Spalte; vorhandene Daten unverändert, alle behalten volle Sicht.

Achtzehnter Durchlauf: Rocket 26.10.16, PR #99, 2.10.2026 — von der Action: Sicht nach Zuordnung dicht gemacht (Erlaubnisliste der Wege, Listen und Kampagnen nur eigene, Leck-Test). `main` unverändert seit 26.10.15; Zeitstempel 4406000000000. Auf `main` byte-gleich geprüft (sha256 `41398194…332d`, keine alten Schlüssel). Migration 0038 nur mit Regeln, keine neuen Tabellen.

Neunzehnter Durchlauf: Rocket 26.10.17, PR #100, 2.10.2026 — von der Action: die Oberfläche zur Sicht nach Zuordnung (Sicht-Dialog, Bereiche, Sichtbarkeit an der Firma, Bezugspersonen). `main` unverändert seit 26.10.16; Zeitstempel 4407000000000. Auf `main` byte-gleich geprüft (sha256 `12be3f32…c77e`, keine alten Schlüssel). Keine Migration.

Zwanzigster Durchlauf: Rocket 26.10.18, PR #102, 2.10.2026 — von der Action: vertrauliche Feldgruppen (Werte in eigener Tabelle, Haken „Sieht vertrauliche Felder“). Dazwischen hat Insilo 0.1.103 eingetragen (PR #101, `_apps.ts`); die Action baute auf diesem Stand. Zeitstempel 4409000000000. Auf `main` byte-gleich geprüft (sha256 `9a462def…b46b`, keine alten Schlüssel). Migration 0039 mit neuer Tabelle `vertrauliche_werte`.

Einundzwanzigster Durchlauf: Rocket 26.10.19, PR #103, 2.10.2026 — von der Action: Modus Vertrieb/Verein, CI-Stand `ci-26.10.11` (Erstellen als Plus, Klappschalter über der Spalte). `main` unverändert seit 26.10.18; Zeitstempel 4410000000000. Auf `main` byte-gleich geprüft (sha256 `545a48f4…6e29`, keine alten Schlüssel). Migration 0040 nur mit einer Spalte.

Zweiundzwanzigster Durchlauf: Rocket 26.10.20, PR #105, 2.10.2026 — von der Action: Mein Postfach (Stufe 2a, ohne Microsoft). Seit 26.10.19 hat Marc Insilo 0.1.104 eingetragen (#104); Rocket baute auf diesem `main`. Zeitstempel 4412000000000. Auf `main` byte-gleich geprüft (sha256 `b9b5c646…ed3c`, keine alten Schlüssel). Migration 0041 legt eine Tabelle an.

Dreiundzwanzigster Durchlauf: Rocket 26.10.21, PR #108, 6.10.2026 — von der Action: Profil oben rechts, Einstellungen in zwei Gruppen, CI-Stand `ci-26.10.13`. Seit 26.10.20 hat Marc viel eingetragen (Modell-Apps, Wings, Relay, Insilo 0.1.105/0.1.106) und die Quellkennung kurz auf `market.aimighty` und wieder zurück auf `market.AImighty` gestellt; die Action baute auf diesem `main`. Zeitstempel 4603000000000. Auf `main` byte-gleich geprüft (sha256 `155c403f…`, keine alten Schlüssel). Keine Migration. Insilo 0.1.106 kam drei Minuten vorher mit derselben Action als PR #107 (sha256 `4b42da9b…`). Kai sah beide nicht auf der Box: Seit Marcs Zurückstellen meldete sich der Markt als `market.AImighty`, Kais Box kennt ihn als `market.aimighty` — siehe „Kennung des Markts“.

**Gelernt:** Eine Markt-Sitzung, die diese Sitzung anlegt, fragt vor PR und Merge in Marcs Repo nach — eine über Claude weitergereichte Freigabe zählt dort nicht. Entweder beantwortet Kai die Rückfrage in der Markt-Sitzung, oder er startet sie selbst mit dem vorbereiteten Auftrag.

## Kennung des Markts (6.10.2026)

Der Markt meldet sich bei jeder Box mit einer Kennung (`SOURCE_ID` in
`functions/_lib.ts`). Die Box übernimmt nur, was unter der Kennung kommt, mit
der sie den Markt eingetragen hat — **Groß- und Kleinschreibung zählen**. Kais
Box kennt ihn als `market.aimighty` (Marc bestätigt, 6.10.2026). Marcs Agent
hatte die Kennung am 4.10. auf `market.aimighty` und 40 Minuten später zurück
auf `market.AImighty` gestellt; seitdem übernahm Kais Box kein Update mehr,
obwohl der Markt Rocket 26.10.21 und Insilo 0.1.106 auslieferte.

Seitdem setzt die Action `markt.yml` die Kennung bei jedem Lauf
(`MARKT_QUELLE`, `scripts/markt-eintrag.py --quelle`). Kennt der Markt die
Version schon und weicht nur die Kennung ab, richtet ein Lauf von Hand
(„Run workflow“ mit der aktuellen Version) allein die Kennung und hebt den
Zeitstempel. Prüfen: Zeigt `/api/v2/applications/rocket` die neue Version, die
Box aber nicht, zuerst die Kennung vergleichen.

## Bekannte Fallen im Markt

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Katalog zeigt alte Version, API die neue | `CHARTS`-Schlüssel ≠ Version in `_apps.ts` | Schlüssel angleichen |
| Olares synct nicht | Version nicht erhöht, oder Cache-Fehler im Markt | Version erhöhen |
| Markt zeigt die neue Version, die Box nicht | `SOURCE_ID` ≠ Kennung, unter der die Box den Markt kennt | Kennung angleichen („Kennung des Markts“) |
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
