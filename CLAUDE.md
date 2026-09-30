# Rocket — Projekt-Briefing für Claude Code

> **Produkt:** Rocket — schlankes, KI-gestütztes CRM für den AImighty-Vertrieb
> **Maintainer:** Kai Böhm (kaivo.studio)
> **Plattform:** Olares OS (Kubernetes-basiert), wie Insilo
> **Status:** 26.9.4 (Versionsschema `YY.M.<n>` wie im Markt, bis 0.13.0 `0.x.y`) — Vertrieb, Versand und Service durchgängig; seit 26.9.2 zweiter Faktor und Stufe 1 aus `docs/PLAN-TEAM.md`; seit 26.9.3/26.9.4 Eigenschaften in Gruppen mit Pflichtfeldern. Bis 0.12.1 hieß das Produkt **Beacon**. Rocket läuft seit 30.9.2026 auf Kais Box, aus dem Markt installiert und neu begonnen (ohne Beacon-Daten; Beacon bleibt vorerst daneben installiert); am selben Tag über den Markt von 26.9.1 auf 26.9.4 aktualisiert
> **Letzte Aktualisierung:** 30. September 2026

---

## Was wir bauen

Ein CRM, das den Vertriebsprozess von AImighty abbildet und dabei
**vollständig auf der eigenen Box läuft**. AImighty verkauft, dass Daten
das Haus nicht verlassen — ein CRM in einer US-Cloud wäre der
Widerspruch, den kein Kunde übersieht.

**Bedienung nach HubSpot, Aussehen nach AImighty.** HubSpot liefert das
Muster: linke Navigation, dichte Listenansichten mit Filtern,
dreispaltige Datensatzseite, Pipeline als Board mit Ziehen und Ablegen.
Farbe, Schrift und Raum kommen aus dem AImighty-Designsystem. Ein
Pixel-Nachbau inklusive HubSpot-Orange war ausdrücklich nicht gewollt.

**Kein HubSpot-Import.** Grüne Wiese, entschieden am 3.9.2026. Das Schema
richtet sich nach dem, was der AImighty-Vertrieb braucht: die
Produktleiter Assistent / Analyst / Experte, Servicetage, Kaufrollen.

Seit 0.8.0 gibt es eine **CSV-Einfuhr** für Kontakte und Firmen und eine
**CSV-Ausfuhr** der aktuellen Liste. Das widerspricht dem nicht: Beides
folgt Rockets eigenen Feldern, HubSpots Kopfzeilen werden nur als Aliase
erkannt. Eine Messe-Liste hereinzuholen ist Einfuhr von Daten, kein Umzug
eines Systems — Verlauf, Aktivitäten und Einwilligungen bleiben draußen.
Siehe `docs/BETRIEB.md`, „CSV hinein und hinaus".

---

## Stand

Der Weg vom ersten Kontakt bis zum Abschluss ist durchgängig da, dazu
Versand, Kampagnen und Tickets. Die ausführliche, stets aktuellere
Begründung jedes Teils steht in `docs/BETRIEB.md`.

| Teil | Zustand |
|---|---|
| Schema + Zeilensicherheit | 35 Migrationen, alle Fachtabellen unter FORCE |
| Backend | rund 210 API-Pfade, FastAPI + asyncpg |
| Oberfläche | Start, Board, Angebote, Prognose, Firmen, Kontakte, Listen, Kampagnen, Tickets, Aufgaben, Fragen, Erkenntnisse, Eingang, Besprechungen, Einfuhr, Einstellungen; Kopfleiste zum Suchen und Anlegen von überall; kurze Navigation mit „Mehr" und Favoriten |
| Angebote | Katalog, Positionen, Summen, Druckfassung mit Briefkopf |
| Qualifizierung | sechs Felder, gerechnete Punktzahl, Verlustgründe |
| Prognose | gewichtet, Trefferquote, Verlustanalyse, nach Produkt |
| KI | Notiz→Struktur, Tagesbriefing, Fragen an den Bestand, Angebotsvorschlag, Qualifizierung aus dem Verlauf, Anschreiben, Erkenntnisse aus Gesprächsnotizen, Firma/Kontakt aus Beschreibung finden, Assistent (Aufträge in Worten, Handlung nur über Karte), Gesprächsvorbereitung als Podcast (zwei Stimmen, gesprochen auf der Box) |
| Insilo-Kopplung | auf derselben Box über Insilos gemeinsamen Ordner wie Relay (seit 0.11.0, `app/insilo_ablage.py`), sonst signierter Webhook; Besprechungen als eigener Bereich mit Vorschlag, nie automatisch zugeordnet; Protokoll ohne Wortlaut (`docs/BETRIEB.md` „Insilo anschließen") |
| Anmeldung | eigene Anmeldung seit 0.6.0 (`ANMELDUNG_MODUS=eigen`, Entrance `public` seit 0.6.9): Einladung, Sitzungen, Geräteübersicht, Bremse nach Fehlversuchen; zweiter Faktor (TOTP, Wiederherstellungscodes, Pflicht für alle als Schalter) seit 26.9.2; Rückweg per Datei unter `/app/data` (setzt auch den Faktor zurück) oder per Mail (Faktor bleibt); Anmeldungen im Audit-Log |
| Zusammenarbeit | jede Person mit eigenem Zugang; Rollen `owner`/`admin`/`member`/`viewer`, Eigentümerin vergibt `admin` (seit 0.9.2); Besitz, Filter „Nur meine"; den Sitzplatz-Wechsel gibt es seit 26.9.2 nicht mehr — jede Person meldet sich selbst an |
| Tresor | SMTP/IMAP-Passwörter, API-Schlüssel und Geheimnisse AES-GCM-verschlüsselt, Schlüssel `tresor.key` unter `/app/data` (seit 0.6.6) |
| Versand | SMTP/IMAP je Organisation, Absenderadresse je Person, Einwilligung am Kontakt, öffentliche Links (Einwilligung, Abmelden, Klick) über eigenen Entrance `rocketlinks`; Listen (statisch/aktiv) und Kampagnen |
| Tickets | eigene Pipeline, SLA-Uhr ab Absendezeit; Eingang aus API, Bot oder Formular über einen gemeinsamen Weg (`ticketeingang.py`) |
| Dokumente | Dateien am Datensatz, wie in HubSpot |
| Datenbank-Blick | `/datenbank` für Verwalter: Tabellen blättern, lesendes SQL, CSV — unter Zeilensicherheit; jede Abfrage vorher mit pglast geprüft (nur SELECT, Tabellen aus `FREI`, Funktionen aus einer Erlaubnisliste), `READ ONLY`, 10 s, protokolliert (`app/datenbank.py`, BETRIEB.md „Datenbank ansehen") |
| Eigenschaften | nach HubSpot: je Objekt Gruppen, feste und eigene Felder gemeinsam, ordnen per Ziehen (auch Tastatur), Datensatzseite in aufklappbaren Abschnitten, einzeln oder alles bearbeiten, Felder im Anlegen-Dialog, Pflichtfelder, Spaltenwahl und Filter nach Gruppen (seit 26.9.3/26.9.4, `docs/BETRIEB.md` „Eigenschaften in Gruppen"); eigene: Text, langer Text, Zahl, Betrag, Datum, Ja/Nein, Auswahl, Mehrfachauswahl, URL, E-Mail, Telefon, Person — geprüft beim Schreiben |
| Pipelines | mehrere nebeneinander, Stufen anlegen/ändern/ordnen/löschen mit Zielangabe |
| Kontakte | anlegen, bearbeiten, löschen; Hauptfirma plus weitere Firmen |
| Segmentierung | Bedingungen auf jedes Feld (auch eigene), gespeicherte Ansichten als Reiter, wählbare Spalten, Sortierung am Kopf, Auswahl und Stapeländerung — dieselbe Komponente für Firmen und Kontakte |
| Stammdaten | Firma, Kontakt, Geschäft, Angebot: ein Bearbeiten-Schalter, Löschen mit Rückfrage |
| Katalog, Verlustgründe, Aufgaben, Verlauf | vollständig pflegbar; Systemeinträge bleiben Geschichte |
| Post | Vertrag für Relay: signiert hinein und hinaus, Entwurf → Senden nur durch Menschen |
| Anreicherung | Firmen und Kontakte aus Website, Suchdienst und LinkedIn-Treffern; jeder Wert mit Quelle, Kontaktdaten nur wörtlich belegt, nie überschreiben; leere Felder von selbst, Rest als Vorschlag |
| Sicherung | Abzug nach jeder Änderung (Prüfung alle 5 Minuten), spätestens alle sechs Stunden, nach `/app/data/sicherungen/`; Wiederanlauf nach Deinstallation samt Einstellungen; Ausfuhr als Download |
| CSV | Einfuhr für Kontakte und Firmen (alles oder nichts, nie überschreiben), Ausfuhr der aktuellen Liste |
| Tests | 704 Backend, 69 Frontend |
| Olares-Chart | lintet (`helm` und `olares-cli chart lint`), rendert; **Rocket 26.9.4 läuft auf Kais Box** (aus dem Aimighty-Katalog, `market.AImighty`; 26.9.1 installiert am 30.9.2026, am selben Tag auf 26.9.4 aktualisiert — das erste Update über den Markt, mit den Migrationen 0033–0035). Die Umbenennung von Beacon war eine Neuinstallation; Kai hat bewusst leer begonnen, ohne Abzug — der Weg mit Abzug steht in `docs/BETRIEB.md`, „Seit 0.13.0: Rocket, vorher Beacon" |
| Veröffentlichung | Repo `github.com/ska1walker/rocket` (öffentlich), Abbilder `ghcr.io/ska1walker/rocket-{frontend,backend}`; Tag und Release entstehen beim Merge nach `main` automatisch (zuletzt `v26.9.4` am 30.9.2026, Chart als Anhang). Katalogeintrag `rocket` **26.9.4 im Markt** (`bayerhazard/aimighty-market` PR #83, 30.9.2026; vorher 26.9.1 mit PR #81); Weg dorthin in `docs/MARKT.md`; Icon nach Marcs Idee 6 (`docs/icon/`) |

**Nicht gebaut, bewusst:** Mehrsprachigkeit (internes Werkzeug),
Sequenzen (Kampagnen ja, automatische Folgen nein), Kalender-Anbindung,
mobile Ansicht über das Responsive hinaus.

**Geplant für Teams:** `docs/PLAN-TEAM.md` — zweiter Faktor, persönliches
Postfach über IMAP/SMTP mit Anbieter-Voreinstellungen (Microsoft 365 nur
per OAuth-Freigabe des Postfachs, kein SSO), feinere Rechte.

**Offen:** Stufe 2 (persönliches Postfach) und Stufe 3 (feinere Rechte)
aus `docs/PLAN-TEAM.md`.

## Plattform-Kontext: Olares OS

Dieselben Constraints wie bei Insilo. Die wichtigsten für dieses Repo:

1. **Anmeldung: Rocket macht es selbst — mit Grund.** Die Hausregel
   „Olares meldet an" gilt für Insilo, nicht mehr für Rocket: Olares
   installiert eine App je Nutzer, ein Team kann sich keinen Bestand
   teilen. Deshalb steht `ANMELDUNG_MODUS=eigen` als Literal im
   Deployment und der Entrance `rocket` auf `public`. In diesem Modus
   gilt `X-Bfl-User` **nicht** und legt nichts an. Der Markt verlangt
   sonst `authLevel: internal` — `public` ist bei Rocket eine bewusste,
   von Kai bestätigte Ausnahme (30.9.2026), nicht zurückdrehen. Reihenfolge ist die
   Sicherheit: erst `eigen`, dann den Entrance öffnen, nie umgekehrt —
   sonst ist ein gefälschter Kopf der Eigentümer. Im Modus `olares`
   (lokal, Altbestand) gilt weiter: Identität aus `X-Bfl-User`, fehlt er,
   wird abgewiesen. Einzelheiten: `docs/BETRIEB.md`, „Anmeldung".

2. **Nur ClusterIP.** Kein NodePort, kein LoadBalancer, kein
   hostNetwork. Von außen führt der Weg nur über den deklarierten
   Entrance.

3. **Datenbank-Zugangsdaten werden injiziert** als `.Values.postgres.*`.
   Nie hartkodieren.

4. **Ein Upgrade friert `values.yaml` ein.** Olares spielt beim
   Aktualisieren die bei der *Installation* gespeicherten Werte zurück
   und übernimmt die Vorgaben des neuen Charts nicht. Deshalb hängt der
   Image-Tag an `.Chart.AppVersion`, und `values.yaml` trägt `tag: ""`.
   Neue Wertschlüssel immer über `(default (dict) .Values.x).y` lesen —
   ein Punktzugriff auf einen Block, den es in der Vorversion nicht gab,
   lässt das Upgrade mit „nil pointer" scheitern.

5. **Eine Deinstallation löscht die Datenbank.** `/app/data` überlebt,
   die Datenbank nicht. Siehe unten.

   **Ein Entrance bringt einen Envoy-Sidecar**, der jeden Aufruf an den
   Pod gegen Authelia prüft. Deshalb hat das Backend keinen Entrance;
   die öffentlichen Mail-Links laufen über ein eigenes Deployment
   (`rocketlinks`, `app/oeffentlich.py`).

6. **Namensregel:** Ordnername, `Chart.yaml.name`, `metadata.name` und
   `metadata.appid` müssen alle exakt `rocket` sein.

7. **Keine Helm-Hooks, kein `.Files.Get`.** Ersteres läuft vor dem
   `ns-owner`-Label und kommt nie durch, Zweiteres lehnt der Markt-Linter
   ab. Deshalb Migrationen als eingebettete ConfigMap plus
   Vorlauf-Container mit Wiederholschleife.

---

## Deinstallation und Sicherung

**Eine Deinstallation löscht die Datenbank.** Olares legt sie bei einer
Neuinstallation frisch an; Firmen, Kontakte, Geschäfte und Verlauf leben
nur dort.

Dagegen steht die Sicherung (`app/sicherung.py`): Seit 0.3.2 nach jeder
Änderung, spätestens alle sechs Stunden, liegt ein vollständiger Abzug
unter `/app/data/sicherungen/` (0600, die letzten 14). Die erste
Anmeldung in eine leere Datenbank spielt den neuesten Abzug samt
Einstellungen zurück — nur in die erste Organisation der Box, und ohne
etwas zu überschreiben. So lief am 5.9.2026 der Umzug von aicrm zu
Beacon.

Zwei Dinge, die man dabei nicht vergessen darf:

- **Abzug und `tresor.key` gehören zusammen.** Die Zugangsdaten stehen
  verschlüsselt im Abzug; wer nur die JSON-Dateien sichert, hat sie nicht.
- **Jede neue Tabelle muss in den Abzug** (`TABELLEN`) oder ausdrücklich
  heraus (`AUSGENOMMEN`) — `test_jede_tabelle_ist_im_abzug_oder_ausdruecklich_nicht`
  bricht sonst. Für Spalten an `users` gibt es eine zweite Wache.

Nachzählen nie ohne Nutzerkontext: Unter FORCE liefert `count(*)` ohne
`acquire_as` immer 0.

---

## Tech-Stack

Bewusst derselbe wie Insilo — was dort trägt, muss hier nicht neu
gelernt werden.

**Oberfläche:** Next.js 15 (App Router) · TypeScript strict · Tailwind v4
· TanStack Query · lucide-react. Kein next-intl: Das CRM ist ein
internes Werkzeug und bleibt einsprachig deutsch.

**Backend:** FastAPI · asyncpg (kein ORM) · Pydantic v2 · httpx.

**Datenbank:** PostgreSQL 16 von Olares. `pg_trgm`, `pgcrypto`,
`uuid-ossp`. **Kein `vector`** — diese Ausbaustufe rechnet keine
Einbettungen, und eine Erweiterung, die niemand nutzt, lässt nur die
lokale Einrichtung scheitern.

**Sprachmodell:** OpenAI-kompatibler Endpunkt, Adresse pro Organisation
in `org_settings`. **Kein Vorgabewert** — dieselbe Entscheidung wie bei
Insilo seit v0.1.72, aus demselben Grund: Jede geratene Adresse ist auf
einer anderen Box falsch.

---

## Designsystem

**Die Werte stehen in `frontend/app/globals.css`.** Der Token-Block und
die Bauteile darunter sind unverändert aus dem AImighty-Paket über Insilo
übernommen; darunter steht ein eigener Abschnitt mit den CRM-Bauteilen.
**Dieser Abschnitt enthält keinen einzigen Farbwert, nur `--am-*`.** Wer
eine Farbe ändern will, ändert das Token.

- **Gold zeichnet aus, es handelt nicht** — Ausnahme Dunkelmodus, dort
  handelt es, weil Blau auf Blau nicht trägt. Beides steckt in den Token.
- **Farbe trägt eine Aussage nie allein.** Jede Stufenpille hat Text,
  jeder Fehler ein Zeichen und einen Satz.
- **Was die KI geschrieben hat, ist als solches erkennbar** — goldener
  Punkt in der Zeitleiste, Beschriftung „KI", Modellname darunter. Nicht
  aus Zierde: In einem Jahr muss unterscheidbar sein, was ein Mensch
  notiert hat.
- **Keine Verläufe, kein Glas, keine Parallaxe, keine KI-Funken.**

- **Die AImighty-Wortmarke oben links bleibt** (`components/marke.tsx`),
  obwohl der Markt für seine Apps „kein Markenname, kein Logo" vorgibt —
  entschieden von Kai am 30.9.2026.

`frontend/tailwind.aimighty.preset.js` ist eine unveränderte Kopie aus
der Lieferung und liest die Token über `var(--am-*)`.

---

## Wie hier gearbeitet wird

1. **Bei Schema-Änderungen:** Migration in `supabase/migrations/0NNN_*.sql`,
   RLS auf jede neue Tabelle **plus `force row level security`**, dann
   `python3 scripts/regen-migrations.py`. Ohne FORCE ist die
   Zeilensicherheit lautlos wirkungslos, weil das Backend als
   Tabelleneigentümer verbindet — der Test
   `test_mandanten_sehen_einander_nicht` fängt genau das.

2. **Bei Chart-Änderungen:** vor dem Commit `bash scripts/check-chart.sh`.

3. **Bei Backend-Änderungen:** Keine Auth-Logik bauen. Jede Abfrage auf
   Fachdaten läuft über `acquire_as(user_id)` — `acquire()` ohne Kontext
   ist nur für die Erstanlage da. Protokolliert wird mit
   `audit.log_fuer(conn, user, …)`: Es hält Person **und** Zugang fest,
   denn am geteilten Olares-Konto sind das zwei verschiedene Dinge.

   **Jede Person meldet sich selbst an.** Den *Sitzplatz* (Kopf
   `X-Rocket-Sitzplatz`) gibt es seit 26.9.2 nicht mehr; `handelnder` ist
   immer die angemeldete Person. Tests, die als eine andere Person
   handeln, holen sich deren Sitzung über `tests.conftest.als_person`
   (Einladung einlösen), nie über einen Kopf. Anmeldenamen sind boxweit
   eindeutig — nie eine vorhandene `users`-Zeile einer fremden
   Organisation wiederverwenden.

   **Neue Tabelle:** in `app/datenbank.py` entweder in `FREI` oder mit
   Grund in `GESPERRT` eintragen, und im Abzug (`sicherung.py`) ebenso —
   zwei Wachen-Tests brechen sonst. Enthält sie ein Geheimnis, gehört sie
   nach `GESPERRT`.

   **Eigene Eigenschaften** liegen als `custom jsonb` an Firma, Kontakt
   und Geschäft; die Datenbank sieht nur JSON. **Feste Felder** stehen
   seit 0034 als Systemeigenschaften (`is_system`) in derselben Tabelle —
   `eigenschaften.definitionen()` liefert nur die eigenen; ein neues festes
   Feld gehört in `eigenschaften.SYSTEMFELDER`. Geprüft wird beim Schreiben
   in `app/eigenschaften.py` gegen die Definition. PATCH führt zusammen
   (`custom || $n`), `null` löscht einen Wert. Typ und Schlüssel einer
   Definition sind nach dem Anlegen fest.

4. **Bei UI-Arbeit:** Erst schauen, ob `globals.css` das Bauteil schon
   hat. Werte nie am Bauteil setzen.

5. **Bei KI-Funktionen** gelten vier Regeln, jede teuer bezahlt:

   - **Zahlen kommen nie aus dem Modell.** Preise aus dem Katalog,
     Zählungen aus der Datenbank. Ein Modell, das einen Betrag erfindet,
     erfindet ihn plausibel — und plausibel falsch kommt bis zum Kunden
     durch.
   - **Kein Datum ausrechnen lassen.** Das Modell kennt das heutige nicht.
     Es nennt die Zeitangabe aus dem Text, gerechnet wird im Backend.
   - **Ergebnis als Aktivität der Art `ai` festhalten**, nie in ein Feld
     schreiben, das jemand von Hand gefüllt hat. Vorschläge füllen die
     Maske, speichern tut ein Mensch.
   - **Ohne Fundstelle keine Antwort.** Wo nichts gefunden wurde, wird
     kein Modell gefragt. Ist kein Endpunkt eingerichtet, sagt die
     Oberfläche das, statt in einen Verbindungsfehler zu laufen.

6. **Sprache:** Oberfläche und Docs deutsch, Sie-Form. Code und
   Commit-Messages englisch. Bezeichner im Code englisch, Kommentare
   deutsch — wie in Insilo.

7. **Bei eingehenden Ereignissen:** Signatur über den **rohen** Body
   prüfen, zeitkonstant vergleichen, den Idempotenzschlüssel des
   Absenders achten. Zugeordnet wird nur, was eindeutig ist — ein
   Protokoll am falschen Kunden ist schlimmer als eines im Eingangskorb.

8. **Bei der Anreicherung** (`app/anreicherung.py`) kommt eine fünfte
   KI-Regel dazu: **Kontaktdaten nur wörtlich belegt.** E-Mail, Telefon,
   LinkedIn, Website, Straße, PLZ und Beschäftigtenzahl müssen in der
   gelesenen Quelle stehen, sonst fallen sie weg — egal, wie sicher das
   Modell klingt. Vorhandene Werte werden nie überschrieben, nur zum
   Vorschlag. LinkedIn wird nie direkt abgerufen; was Suchtreffer von
   öffentlichen Profilen zeigen, ist die Quelle. Ein nachdenkendes Modell
   braucht Platz: 6.000 Token für die Zuordnung, sonst kommt nur das
   Nachdenken an.

9. **Beim Veröffentlichen:** `docs/BETRIEB.md`, Abschnitt
   „Veröffentlichen". Version `YY.M.<n>` (Monat ohne führende Null,
   Zähler je Monat neu, z. B. `26.10.1`) an drei Stellen, per PR nach
   `main` mergen — **den Tag `vYY.M.n` setzt `release.yml` danach selbst**
   (baut die Abbilder, legt Tag und Release mit dem Chart als Anhang an).
   Claude pusht keine Tags, das lässt die Sitzung nicht zu; Kai muss
   dafür nichts mehr von Hand tun. Das Chart wird immer als Paket geprüft
   (`olares-cli chart lint dist/rocket-YY.M.n.tgz`), und **erst nach einer
   laufenden Installation auf einer Box** geht der Eintrag per PR in
   `bayerhazard/aimighty-market`. Die Regeln dahinter stehen im Skill
   `insilo/.claude/skills/olares-release/SKILL.md`; was der Markt selbst
   verlangt (Version an 5 Stellen, frisches base64, jede Änderung = neue
   Version) und wo Rocket bewusst abweicht, steht in `docs/MARKT.md`.

10. **Bei Unsicherheit:** stoppen und Kai fragen.

11. **Builds, CI und Merges selbst verfolgen — nicht fragen.** Nach jedem
    Push, PR, Merge oder Release prüft Claude den Stand selbst (Check-Runs
    des PR, Workflow-Läufe, Merge-Status auf GitHub, Abbilder in GHCR) und
    meldet erst das Ergebnis: grün und erledigt, oder rot mit Ursache und
    Fix. „Gemergt" heißt: GitHub zeigt `merged: true`. Kai soll nie
    nachfragen müssen, ob ein Build fertig ist (festgelegt 30.9.2026).

---

## Lokale Entwicklung

Siehe `docs/BETRIEB.md`. Kurz:

```bash
brew services start postgresql@16
backend/.venv/bin/uvicorn app.main:app --port 8000   # aus backend/
cd frontend && BACKEND_URL=http://localhost:8000 npm run dev
python3 scripts/seed-dev.py                           # Beispieldaten
```

---

## Was NICHT gebaut wird

- ❌ Anmeldung an Rocket über Microsoft oder Google (SSO) — die Anmeldung bleibt Rocket-Passwort plus zweiter Faktor; siehe `docs/PLAN-TEAM.md`
- ❌ Cloud-Sync zwischen Boxen
- ❌ Telemetrie, Tracking, Phone-Home
- ❌ Schriften vom CDN — auch nicht zur Bauzeit
- ❌ Ein zweites Designsystem
