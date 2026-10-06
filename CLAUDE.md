# Rocket — Projekt-Briefing für Claude Code

> **Produkt:** Rocket — schlankes, AI-gestütztes CRM für den AImighty-Vertrieb
> **Maintainer:** Kai Böhm (kaivo.studio)
> **Plattform:** Olares OS (Kubernetes-basiert), wie Insilo
> **Status:** 26.10.21 (Versionsschema `YY.M.<n>` wie im Markt, bis 0.13.0 `0.x.y`) — Vertrieb, Versand und Service durchgängig; seit 26.9.2 zweiter Faktor und Stufe 1 aus `docs/PLAN-TEAM.md`; seit 26.9.3/26.9.4 Eigenschaften in Gruppen mit Pflichtfeldern; 26.9.5 behebt die Befunde der GUI-Prüfung (`docs/BETRIEB.md` „GUI-Prüfung“), 26.9.6 schließt die Tastaturlücken und prüft die Oberfläche in der CI im Browser, 26.9.7 gibt der Web-App das Rocket-Icon, 26.10.1 behebt, was die Prüfung übersah (Hinweise ohne Rand, Leerzustand, Druckfassung am Handy; `docs/BETRIEB.md` „Übersehen und nachgezogen“) und prüft die Lage jeder Seite hell und dunkel; die Erstinstallation läuft über einen Einrichtungscode statt über den Olares-Kopf (26.10.2 macht ihn fehlertolerant); 26.10.3 hebt den gedämpften Text auf #567595 und prüft den Kontrast in der CI; 26.10.4 gibt den Einstellungen eine senkrechte Navigation (Handy: Übersichtsliste, HB-UNTERNAV); 26.10.5 nimmt die Token aus dem CI-Repo (`tokens/app.css`, Abgleich Paket 1), behebt vier Kontrastfehler (Rand, Fokusring, Lösch-Knopf) und rechnet den Kontrast aus den Token; 26.10.6 setzt Paket 2 um (Löschen rot mit Wort, „AI“ statt „KI“, Rakete im App-Icon, Schatten nur für Schwebendes, Fristen mit Uhr und Wort, Maße aus dem CI). 26.10.7 setzt Paket 5 um (Grundgerüst aller AImighty-Apps: Seitentitel 28 px, jeder Knopf 8 px, gewählter Eintrag getönt, Symbolknöpfe mit Tooltip, im Tab nur die Rakete und „Seite · Rocket“) und bringt jedes Release über die Action `markt.yml` von selbst in den Markt. 26.10.8 bringt Rocket im Markt auch auf Deutsch (`olares/markt/beschreibung.*.md`, Notizen mit `## Deutsch`) und unter „Applications“; der gewählte Navigationseintrag ist nur noch eine Goldkante ohne Fläche (CI G1 nachgeschärft). 26.10.9 zeichnet jedes Symbol aus dem CI-Set (HB-SYMBOL statt lucide-react, 16/20/24/40, Strich 1,5 px; ABGLEICH R2), 26.10.10 die Rollenzeichen an der Produktleiter und „lokal“ im Nachweis; 26.10.11 holt Token, Zeichen und Bausteine als Stand aus dem CI (Paket 4, `frontend/ci/`) und richtet das Suchfeld an der Linie der Seite aus. 26.10.12 behebt React #418 im Rundgang: Next ließ seine Icon-Marke `«nxt-icon»` stehen, wenn eine Stückgrenze des Datenstroms hineinfiel — die Symbole stehen deshalb selbst im `<head>`, nicht unter `app/` (`docs/BETRIEB.md` „#418“). 26.10.13 bringt den Dichteschalter (Weit/Normal/Kompakt im Kontomenü, nur am Zeiger; `docs/BETRIEB.md` „Dichte“). 26.10.14 öffnet die Eigenschaften für Programme von außen: API-Schlüssel (Bearer `rk_…`) mit Bereich, Rolle der erzeugenden Person, Widerruf und Protokoll (`docs/BETRIEB.md` „Eigenschaften über die API“). 26.10.15 legt das Fundament für Stufe 3 aus `docs/PLAN-TEAM.md`: Sicht je Person (`alles`/`eingeschraenkt`), Zugriff auf Firma oder Bereich, Beziehungen zwischen Kontakten, Regeln in der Datenbank; `viewer` liest nur (`docs/BETRIEB.md` „Sicht nach Zuordnung“). 26.10.16 macht es dicht: Erlaubnisliste der Wege für Eingeschränkte, Listen und Kampagnen nur eigene, keine Firmen-Zusammenfassung, neutrale Dubletten-Meldung, Leck-Test über jede Route (`tests/test_leck.py`). 26.10.17 bringt die Oberfläche dazu: Sicht-Dialog an jeder Person, Bereiche, „Sichtbarkeit“ an der Firma, Bezugspersonen am Kontakt, Navigation nur mit offenen Wegen (RK-SICHT, Rundgang als Trainer `e2e/sicht.spec.ts`). 26.10.18 bringt vertrauliche Feldgruppen: Werte in `vertrauliche_werte`, nur für Eigentümerin, Verwalter und Personen mit dem Haken „Sieht vertrauliche Felder“; Filter, Spalten, Ausfuhr und Protokoll kennen sie nur für sie (`app/vertraulich.py`, `docs/BETRIEB.md` „Vertrauliche Feldgruppen“). 26.10.19 schließt Stufe 3 mit dem Modus Vertrieb/Verein (nur Begriffe, Navigation, Vorlagen; `lib/begriffe.ts`, RK-MODUS), holt den CI-Stand `ci-26.10.11` und macht „Erstellen“ in der Kopfleiste zum Plus-Zweitknopf — eine Hauptaktion je Ansicht. 26.10.20 beginnt Stufe 2: „Mein Postfach“ — jede Person verbindet ihr eigenes Postfach über IMAP (Voreinstellungen Google, IONOS, Strato, one.com; Microsoft bewusst nicht), Rocket legt nur Mails mit Kontakten in den Verlauf (`app/mailkonten.py`, RK-POSTFACH, `docs/BETRIEB.md` „Mein Postfach“). 26.10.21 setzt das Profil oben rechts in die Kopfleiste (auch am Handy, CI G8, HB-KONTO), streicht den Fuß der Navigation samt „Alles auf dieser Box“ und teilt die Einstellungen in „Mein Konto“ und „Organisation“ (`docs/BETRIEB.md` „Profil oben rechts“). Bis 0.12.1 hieß das Produkt **Beacon**. Rocket läuft seit 30.9.2026 auf Kais Box, aus dem Markt installiert und neu begonnen (ohne Beacon-Daten; Beacon bleibt vorerst daneben installiert); über den Markt aktualisiert, seit 1.10.2026 mit Passwort, zuletzt auf 26.10.13
> **Letzte Aktualisierung:** 1. Oktober 2026

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
| Schema + Zeilensicherheit | 41 Migrationen, alle Fachtabellen unter FORCE; seit 26.10.15 zusätzlich RESTRICTIVE-Regeln nach Sicht und Zugriff, seit 26.10.18 für vertrauliche Werte, seit 26.10.20 für das eigene Postfach (nur seine Person) |
| Backend | rund 210 API-Pfade, FastAPI + asyncpg |
| Oberfläche | Start, Board, Angebote, Prognose, Firmen, Kontakte, Listen, Kampagnen, Tickets, Aufgaben, Fragen, Erkenntnisse, Eingang, Besprechungen, Einfuhr, Einstellungen; Kopfleiste zum Suchen und Anlegen von überall, ganz rechts das Profil; Einstellungen in „Mein Konto“ und „Organisation“; kurze Navigation mit „Mehr" und Favoriten |
| Angebote | Katalog, Positionen, Summen, Druckfassung mit Briefkopf |
| Qualifizierung | sechs Felder, gerechnete Punktzahl, Verlustgründe |
| Prognose | gewichtet, Trefferquote, Verlustanalyse, nach Produkt |
| AI | Notiz→Struktur, Tagesbriefing, Fragen an den Bestand, Angebotsvorschlag, Qualifizierung aus dem Verlauf, Anschreiben, Erkenntnisse aus Gesprächsnotizen, Firma/Kontakt aus Beschreibung finden, Assistent (Aufträge in Worten, Handlung nur über Karte), Gesprächsvorbereitung als Podcast (zwei Stimmen, gesprochen auf der Box) |
| Insilo-Kopplung | auf derselben Box über Insilos gemeinsamen Ordner wie Relay (seit 0.11.0, `app/insilo_ablage.py`), sonst signierter Webhook; Besprechungen als eigener Bereich mit Vorschlag, nie automatisch zugeordnet; Protokoll ohne Wortlaut (`docs/BETRIEB.md` „Insilo anschließen") |
| Anmeldung | eigene Anmeldung seit 0.6.0 (`ANMELDUNG_MODUS=eigen`, Entrance `public` seit 0.6.9): Einladung, Sitzungen, Geräteübersicht, Bremse nach Fehlversuchen; zweiter Faktor (TOTP, Wiederherstellungscodes, Pflicht für alle als Schalter) seit 26.9.2; Erstinstallation mit Code aus `/app/data` (seit 26.10.1, kein Kopf mehr); Rückweg per Datei unter `/app/data` (setzt auch den Faktor zurück) oder per Mail (Faktor bleibt); Anmeldungen im Audit-Log; API-Schlüssel für Programme seit 26.10.14 (nur Bereich `eigenschaften`, handeln mit der aktuellen Rolle der erzeugenden Person, kein zweiter Faktor, `app/api_schluessel.py`) |
| Zusammenarbeit | jede Person mit eigenem Zugang; Rollen `owner`/`admin`/`member`/`viewer`, Eigentümerin vergibt `admin` (seit 0.9.2) und `viewer` (liest nur, seit 26.10.15); Sicht `alles`/`eingeschraenkt` mit Zugriff auf Firmen oder Bereiche (seit 26.10.15, in den Einstellungen seit 26.10.17), Bezugspersonen am Kontakt; Haken „Sieht vertrauliche Felder“ je Person (seit 26.10.18); Besitz, Filter „Nur meine"; den Sitzplatz-Wechsel gibt es seit 26.9.2 nicht mehr — jede Person meldet sich selbst an |
| Tresor | SMTP/IMAP-Passwörter, API-Schlüssel und Geheimnisse AES-GCM-verschlüsselt, Schlüssel `tresor.key` unter `/app/data` (seit 0.6.6) |
| Versand | SMTP/IMAP je Organisation, Absenderadresse je Person, Einwilligung am Kontakt, öffentliche Links (Einwilligung, Abmelden, Klick) über eigenen Entrance `rocketlinks`; Listen (statisch/aktiv) und Kampagnen; seit 26.10.20 „Mein Postfach“ je Person (IMAP lesen, nur Kontakte, alle 2 Minuten; Senden darüber folgt als 2b) |
| Tickets | eigene Pipeline, SLA-Uhr ab Absendezeit; Eingang aus API, Bot oder Formular über einen gemeinsamen Weg (`ticketeingang.py`) |
| Dokumente | Dateien am Datensatz, wie in HubSpot |
| Datenbank-Blick | `/datenbank` für Verwalter: Tabellen blättern, lesendes SQL, CSV — unter Zeilensicherheit; jede Abfrage vorher mit pglast geprüft (nur SELECT, Tabellen aus `FREI`, Funktionen aus einer Erlaubnisliste), `READ ONLY`, 10 s, protokolliert (`app/datenbank.py`, BETRIEB.md „Datenbank ansehen") |
| Eigenschaften | nach HubSpot: je Objekt Gruppen, feste und eigene Felder gemeinsam, ordnen per Ziehen (auch Tastatur), Datensatzseite in aufklappbaren Abschnitten, einzeln oder alles bearbeiten, Felder im Anlegen-Dialog, Pflichtfelder, Spaltenwahl und Filter nach Gruppen (seit 26.9.3/26.9.4, `docs/BETRIEB.md` „Eigenschaften in Gruppen"); eigene: Text, langer Text, Zahl, Betrag, Datum, Ja/Nein, Auswahl, Mehrfachauswahl, URL, E-Mail, Telefon, Person — geprüft beim Schreiben; über die API mit Schlüssel pflegbar (seit 26.10.14, `docs/BETRIEB.md` „Eigenschaften über die API“); Gruppen vertraulich schaltbar (seit 26.10.18) |
| Pipelines | mehrere nebeneinander, Stufen anlegen/ändern/ordnen/löschen mit Zielangabe |
| Kontakte | anlegen, bearbeiten, löschen; Hauptfirma plus weitere Firmen |
| Segmentierung | Bedingungen auf jedes Feld (auch eigene), gespeicherte Ansichten als Reiter, wählbare Spalten, Sortierung am Kopf, Auswahl und Stapeländerung — dieselbe Komponente für Firmen und Kontakte |
| Stammdaten | Firma, Kontakt, Geschäft, Angebot: ein Bearbeiten-Schalter, Löschen mit Rückfrage |
| Katalog, Verlustgründe, Aufgaben, Verlauf | vollständig pflegbar; Systemeinträge bleiben Geschichte |
| Post | Vertrag für Relay: signiert hinein und hinaus, Entwurf → Senden nur durch Menschen |
| Anreicherung | Firmen und Kontakte aus Website, Suchdienst und LinkedIn-Treffern; jeder Wert mit Quelle, Kontaktdaten nur wörtlich belegt, nie überschreiben; leere Felder von selbst, Rest als Vorschlag |
| Sicherung | Abzug nach jeder Änderung (Prüfung alle 5 Minuten), spätestens alle sechs Stunden, nach `/app/data/sicherungen/`; Wiederanlauf nach Deinstallation samt Einstellungen; Ausfuhr als Download |
| CSV | Einfuhr für Kontakte und Firmen (alles oder nichts, nie überschreiben), Ausfuhr der aktuellen Liste |
| Tests | 745 Backend, 112 Frontend, 185 im Browser (Playwright, CI-Job „oberfläche“) |
| Olares-Chart | lintet (`helm` und `olares-cli chart lint`), rendert; **Rocket 26.10.13 läuft auf Kais Box** (aus dem Aimighty-Katalog, `market.AImighty`; 26.9.1 installiert am 30.9.2026, am selben Tag auf 26.9.4 aktualisiert — das erste Update über den Markt, mit den Migrationen 0033–0035; am 1.10.2026 auf 26.10.2, eingerichtet über den Einrichtungscode für den vorhandenen Zugang `kaivostudio`, Bestand erhalten; am selben Tag auf 26.10.3, 26.10.5, 26.10.7 und 26.10.13 — von 26.10.7 direkt, läuft (Kai)). Die Umbenennung von Beacon war eine Neuinstallation; Kai hat bewusst leer begonnen, ohne Abzug — der Weg mit Abzug steht in `docs/BETRIEB.md`, „Seit 0.13.0: Rocket, vorher Beacon" |
| Veröffentlichung | Repo `github.com/ska1walker/rocket` (öffentlich), Abbilder `ghcr.io/ska1walker/rocket-{frontend,backend}`; Tag und Release entstehen beim Merge nach `main` automatisch (zuletzt `v26.10.21` am 6.10.2026, Chart als Anhang). Katalogeintrag `rocket` **26.10.21 im Markt** (`bayerhazard/aimighty-market` PR #108, 6.10.2026, von der Action; vorher 26.10.20 mit PR #105; vorher 26.10.19 mit PR #103; vorher 26.10.18 mit PR #102; vorher 26.10.17 mit PR #100; vorher 26.10.16 mit PR #99; vorher 26.10.15 mit PR #98; vorher 26.10.14 mit PR #97; vorher 26.10.13 mit PR #96; vorher 26.10.12 mit PR #95; vorher 26.10.11 mit PR #94; vorher 26.10.10 mit PR #93; vorher 26.10.9 mit PR #92; vorher 26.10.8 mit PR #91, deutsch und unter „Applications“; vorher 26.10.7 mit PR #90, enthält 26.10.6 — der erste Eintrag durch die Action `markt.yml`; vorher 26.10.5 mit PR #89, enthält 26.10.4; vorher 26.10.3 mit PR #88, 26.10.2 mit PR #87, 26.10.1 mit PR #86, 26.9.7 mit PR #85, enthält 26.9.6; 26.9.5 mit PR #84, 26.9.4 mit PR #83, 26.9.1 mit PR #81); Weg dorthin in `docs/MARKT.md`; Icon nach Marcs Idee 6 (`docs/icon/`) |

**Nicht gebaut, bewusst:** Mehrsprachigkeit (internes Werkzeug),
Sequenzen (Kampagnen ja, automatische Folgen nein), Kalender-Anbindung,
mobile Ansicht über das Responsive hinaus.

**Geplant für Teams:** `docs/PLAN-TEAM.md` — zweiter Faktor, persönliches
Postfach über IMAP/SMTP mit Anbieter-Voreinstellungen (kein SSO;
Microsoft 365 per OAuth bewusst nicht, Kai 2.10.2026), feinere Rechte.

**Offen:** Stufe 2b (Senden über das eigene Postfach, Ablage in Gesendet,
Vorschlag „Kontakt anlegen?“) und 2c (privat markieren) aus
`docs/PLAN-TEAM.md`; 2a ist mit 26.10.20 da. Stufe 3 (feinere Rechte, für
Kais Verein) ist mit 26.10.19 vollständig.

## Plattform-Kontext: Olares OS

Dieselben Constraints wie bei Insilo. Die wichtigsten für dieses Repo:

1. **Anmeldung: Rocket macht es selbst — mit Grund.** Die Hausregel
   „Olares meldet an" gilt für Insilo, nicht mehr für Rocket: Olares
   installiert eine App je Nutzer, ein Team kann sich keinen Bestand
   teilen. Deshalb steht `ANMELDUNG_MODUS=eigen` als Literal im
   Deployment und der Entrance `rocket` auf `public`. In diesem Modus
   gilt `X-Bfl-User` **nicht** und legt nichts an. Der Markt verlangt
   sonst `authLevel: internal` — `public` ist bei Rocket eine bewusste,
   von Kai bestätigte Ausnahme (30.9.2026), nicht zurückdrehen. Auch vor
   dem ersten Passwort gilt der Kopf im Modus `eigen` **nicht** (bis 26.9.7
   tat er es — ein offenes Tor); die Erstinstallation läuft über einen Code
   in `Data › rocket › rocket-einrichten.txt` (`app/einrichtung.py`, seit
   26.10.1). Reihenfolge ist die
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
· TanStack Query · Zeichen aus dem CI-Set (HB-SYMBOL, seit 26.10.9 statt lucide-react). Kein next-intl: Das CRM ist ein
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

**Token, Zeichen und Bausteine kommen aus dem CI-Repo** `ska1walker/aimighty-ci`
(Paket 4, Kai 1.10.2026, seit 26.10.11): Rocket hält einen Stand `ci-YY.M.n`
als Kopie unter `frontend/ci/` (mit `stand.json`), geholt mit
`node scripts/ci-holen.mjs --von <klon> --stand ci-YY.M.n` — nie `main`, nie
zur Bauzeit. Der Token-Block oben in `globals.css` ist `ci/tokens/app.css`,
jeder `AM-`/`HB-` Abschnitt ist `ci/bauteile/<KENNUNG>.css`;
`lib/__tests__/ci-stand.test.ts` wacht. **Ändern nur im CI**, dann neu
holen — seit `ci-26.10.12` holt die Action `stand` im CI jeden neuen Stand
selbst als PR „CI-Stand ci-…“ in Rocket und Insilo (`werkzeug/apps.json`
dort, braucht `APPS_TOKEN`); so einen PR prüft Claude wie jeden anderen und
mergt ihn bei grün; eine Abweichung von CI-Regeln geht nur über einen Eintrag in
`ABGLEICH.md` im CI-Repo, nie still (`docs/BETRIEB.md` „Stand aus dem CI“). Die Bauteile darunter
stammen aus dem AImighty-Paket über Insilo; darunter steht ein eigener
Abschnitt mit den CRM-Bauteilen.
**Dieser Abschnitt enthält keinen einzigen Farbwert, nur `--am-*`.** Wer
eine Farbe ändern will, ändert das Token.

- **Gold zeichnet aus, es handelt nicht** — Ausnahme Dunkelmodus, dort
  handelt es, weil Blau auf Blau nicht trägt. Beides steckt in den Token.
- **Farbe trägt eine Aussage nie allein.** Jede Stufenpille hat Text,
  jeder Fehler ein Zeichen und einen Satz.
- **Was die AI geschrieben hat, ist als solches erkennbar** — goldener
  Punkt in der Zeitleiste, Beschriftung „AI“, Modellname darunter (seit 26.10.6 „AI“, nicht „KI“ — CI `kern/wording.md`, ein Test wacht darüber). Nicht
  aus Zierde: In einem Jahr muss unterscheidbar sein, was ein Mensch
  notiert hat.
- **Keine Verläufe, kein Glas, keine Parallaxe, keine AI-Funken.** „Funken“
  meint Effekte (Glitzer, Schimmer, Sterne als Schmuck). Das Strichzeichen
  `ai` (Funken, `Sparkles`) bleibt das Zeichen für AI (Kai, 1.10.2026).

- **Jedes Zeichen kommt aus dem CI-Set** (`marke/icons/ui/` im CI-Repo), über
  HB-SYMBOL (`components/symbol.tsx`, erzeugt nach `lib/symbole.tsx`) — nie
  aus `lucide-react` oder direkt aus Lucide; fehlt eins, kommt es erst ins
  CI-Set und kommt mit dem nächsten Stand. Größen nur 16/20/24/40, Strich immer 1,5 px (seit 26.10.9,
  ABGLEICH R2; `docs/BETRIEB.md` „Ein Icon-Set für alle Apps“).

- **Das Symbol der Web-App ist das Rocket-Icon** aus `docs/icon/rocket.svg`
  — Favicon, Apple-Touch-Icon (Home-Bildschirm) und Manifest, unter `public/`
  und im `<head>` von `app/layout.tsx` verlinkt, **nie als `app/icon.*`** (sonst
  kommt React #418 zurück, seit 26.10.12), erzeugt mit
  `frontend/scripts/app-symbole.mjs`. Nie ein Platzhalter, nie ein
  anderes Bild; ändert sich das Icon, alle neu erzeugen (festgelegt von
  Kai am 30.9.2026, `docs/BETRIEB.md` „Symbol der Web-App"). Seit 26.10.6 trägt das Wappen die Rakete statt des „R“ (Figma „Icon-Labor“, Abschnitt 0); auch das Markt-Icon `icon.png` kommt aus `app-symbole.mjs`. **Im Browser-Tab steht nur die Rakete** (`docs/icon/tab.svg`, seit 26.10.7, CI G7): Bei 16 px wäre die Kachel ein Fleck, und alle AImighty-Apps sähen gleich aus; der Tab-Titel nennt zuerst die Seite („Firmen · Rocket“).

- **Die AImighty-Wortmarke oben links bleibt** (`components/marke.tsx`),
  obwohl der Markt für seine Apps „kein Markenname, kein Logo" vorgibt —
  entschieden von Kai am 30.9.2026.

**Bausteine für die ganze Schmiede:** `docs/MODULE.md` beschreibt jedes
Modul der Oberfläche mit Kennung, Bild und Übertragbarkeit. `AM-` kommt
aus dem Paket und ist überall gleich, `HB-` sind Hausbausteine, die Relay
und andere Apps übernehmen sollen (Kennung bleibt), `RK-` ist
CRM-Fachlichkeit.

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
   nach `GESPERRT`. Hängt sie an Kontakt, Firma, Lead oder Ticket, braucht
   sie eine RESTRICTIVE-Regel nach Sicht (Muster in
   `0037_sicht_und_zugriff.sql`) — sonst sieht eine eingeschränkte Person
   dort alles. **Neue Route**, die eingeschränkte Personen brauchen: in
   `auth.EINGESCHRAENKT_ERLAUBT` eintragen; `tests/test_leck.py` ruft jede
   GET-Route mit fremden Kennungen auf und bricht, wenn etwas herauskommt.

   **Eigene Eigenschaften** liegen als `custom jsonb` an Firma, Kontakt
   und Geschäft; die Datenbank sieht nur JSON. **Feste Felder** stehen
   seit 0034 als Systemeigenschaften (`is_system`) in derselben Tabelle —
   `eigenschaften.definitionen()` liefert nur die eigenen; ein neues festes
   Feld gehört in `eigenschaften.SYSTEMFELDER`. Geprüft wird beim Schreiben
   in `app/eigenschaften.py` gegen die Definition. PATCH führt zusammen
   (`custom || $n`), `null` löscht einen Wert. Typ und Schlüssel einer
   Definition sind nach dem Anlegen fest. **Vertrauliche** Werte (Gruppe mit
   `vertraulich`, seit 26.10.18) stehen nicht in `custom`, sondern in
   `vertrauliche_werte`: Wer `custom` schreibt, teilt mit
   `vertraulich.aufteilen` und legt mit `vertraulich.schreiben` ab; wer
   Datensätze liest, holt sie mit `vertraulich.spalte` dazu. Ein neuer Weg,
   der `custom` liest (Suche, AI), bekommt sie bewusst nicht.

4. **Bei UI-Arbeit:** Ein Text, der Firma, Kontakt oder Kampagne nennt,
   holt das Wort aus `lib/begriffe.ts` (`useBegriffe()`) — im Modus Verein
   heißen sie Mannschaft, Person, Rundmail (seit 26.10.19). Erst schauen, ob `globals.css` das Bauteil schon
   hat, und in `docs/MODULE.md`, ob es den Baustein schon gibt — jeder
   hat dort eine Kennung (`AM-`, `HB-`, `RK-`), die auch im Kopf seiner
   Datei und im CSS-Abschnitt steht; ein neuer Baustein bekommt sie an
   allen drei Stellen. **Jede Kopfzeile `/* ── … ─` in `globals.css` trägt
   eine Kennung** (`abschnitte.test.ts` wacht): Aus diesen Abschnitten
   stammen die `bauteile/` des CI (Paket 3). Ein `AM-` oder `HB-` Baustein
   ändert sich zuerst im CI (seit Paket 4; Entwurf aus Rocket mit
   `werkzeug/bauteile.py … --uebernehmen`), dann neuen Stand holen und die
   Bilder mit `frontend/scripts/modulbilder.mjs` neu aufnehmen. Werte nie am Bauteil setzen — ein Text mit Rolle
   nimmt eine Klasse aus HB-TEXT, nicht `style`. Jeder Dialog ist ein
   `Dialog` oder eine `Rueckfrage` (`components/dialog.tsx`: Fokus, Tab,
   Escape inklusive); Spalten, die das Handy nicht trägt, kommen aus
   CSS mit Umbruch (`.feldreihe`, `.datensatz-zwei`), nicht inline. Eine
   neue Seite gehört in `frontend/e2e/rundgang.spec.ts`, ein neuer
   Tastaturweg in `tastatur.spec.ts` — die CI geht sie im Browser durch,
   hell und dunkel. Nichts steht ohne Rand direkt in der Seite (ein
   Hinweis gehört in `.seitenhinweise`, eine zweite Navigationsebene ist
   HB-UNTERNAV); `e2e/lage.ts` prüft Rand,
   Abstand und Mitte. Prüfen heißt auch hinsehen: Bilder jeder
   geänderten Seite in hell und dunkel, mit und ohne Daten.

5. **Bei AI-Funktionen** gelten vier Regeln, jede teuer bezahlt:

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
   AI-Regel dazu: **Kontaktdaten nur wörtlich belegt.** E-Mail, Telefon,
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
   (`olares-cli chart lint dist/rocket-YY.M.n.tgz`). **Seit 26.10.7 geht
   der Eintrag in `bayerhazard/aimighty-market` von selbst:** Nach dem
   Release baut die Action `markt.yml` ihn auf Marcs frischem `main`,
   beweist ihn mit wrangler, öffnet den PR und mergt ihn (Kai, 1.10.2026,
   „ganz automatisch“; `docs/MARKT.md`, „Der Weg in den Markt“). Dafür
   gehört in **jeden Release-PR** die Notiz `olares/markt/<version>.md`
   (`# Titel`, darunter Englisch ab `v<version>: `, nach `## Deutsch` derselbe
   Text auf Deutsch) — `check-chart.sh` verlangt sie. Claude prüft nach dem Merge den Lauf von `markt` und den
   Eintrag auf `main` wie jeden anderen Build. Ohne das Geheimnis
   `MARKT_TOKEN` gilt der alte Weg unten. **Marc veröffentlicht dort selbst Apps
   und ändert den Markt** — vor jedem Eintrag `upstream/main` frisch
   holen, darauf bauen, nachlesen, was sich seit dem letzten
   Rocket-Eintrag an `functions/` geändert hat, und gegen genau diesen
   Stand mit wrangler beweisen (`docs/MARKT.md`, „Der Markt bewegt sich
   auch ohne uns", festgelegt 30.9.2026). Den PR in Marcs Repo öffnet eine
   Sitzung, die **Kai selbst startet**; Claude liefert Zweig und fertigen
   Auftrag (`docs/MARKT.md`, „Kai startet die Sitzung“, festgelegt 1.10.2026) —
   seit 26.10.7 nur noch der Rückfallweg, wenn die Action nicht kann. Die Regeln dahinter stehen im Skill
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


12. **Sitzungen** (Kai, 5.10.2026): Eine Sitzung je App und je größerem
    Thema, nicht eine endlose — das Gedächtnis sind diese Datei und `docs/`.
    Eine Rocket-Sitzung hat `ska1walker/rocket` und `ska1walker/aimighty-ci`
    mit Schreibrecht, dazu `ska1walker/aimighty-market` zum Prüfen des Markts.
    Eine gemeinsame Änderung (Token, Zeichen, `AM-`/`HB-`) beginnt in der
    App-Sitzung, die sie braucht: dort ausprobieren, PR ins CI, mergen; die
    Action `stand` öffnet dann in jeder App einen PR „CI-Stand ci-…“. Diese
    PRs mergt dieselbe Sitzung bei grün, auch in Insilo — wenn Insilo mit
    Schreibrecht verbunden ist. **Zu Beginn jeder Sitzung** nach offenen PRs
    „CI-Stand ci-…“ in diesem Repo sehen und sie bei grün mergen (rot: im
    selben PR anpassen). Eine eigene CI-Sitzung nur für reine
    Designsystem-Arbeit (Abgleich-Pakete, Regeln, eine neue App anschließen),
    mit allen Apps verbunden. Nie zwei Sitzungen auf demselben Zweig; im
    CI-Repo nur ein offener PR zur Zeit, weil jeder Merge einen Stand setzt
    (CI `STAND.md`, „Sitzungen“).
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
