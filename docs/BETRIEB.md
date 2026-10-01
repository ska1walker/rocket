# Betrieb und Entwicklung

## Seit 0.13.0: Rocket, vorher Beacon

Am 29. September 2026 wurde das Produkt von **Beacon** in **Rocket**
umbenannt — Repo (`ska1walker/rocket`), Abbilder
(`ghcr.io/ska1walker/rocket-*`), Olares-Name und `appid`, Namespace
(`rocket-<nutzer>`), Datenbank, Kopfzeilen (`X-Rocket-*`), Kekse und
lokale Einstellungen im Browser, Dateinamen der Abzüge (`rocket-*.json`)
und Katalogeintrag.

**Diesmal ohne Alias, mit Absicht.** Anders als beim Schritt von aicrm zu
Beacon versteht Rocket die alten Namen nicht mehr: keine
`X-Beacon-*`-Kopfzeilen, keine Abzüge `beacon-*.json`, kein Keks
`beacon_sitzung`. Die Kopfzeilen `X-Aicrm-*` und Abzüge `aicrm-*.json`
aus der Zeit davor bleiben lesbar. Wer den Bestand mitnehmen will, muss
deshalb die Abzüge von Hand umbenennen — sonst startet Rocket leer.

**Eine Umbenennung ist auf Olares eine Neuinstallation.** Die Kennung
ist `md5(<appname>)[:8]`, für Rocket `fdfedc01`; die App heißt dann
`https://fdfedc010.<nutzer>.<zone>`, der öffentliche Pfad (Links aus
Mails) `…011.`. Der Umzug, in dieser Reihenfolge:

1. In Beacon einen frischen Abzug schreiben (`POST /api/sicherung` oder
   *Einstellungen › Sicherung*).
2. In *Dateien* den Ordner `Data/rocket/sicherungen` anlegen (uid 1000),
   den neuesten Abzug aus `Data/beacon/sicherungen` hineinkopieren und
   dabei von `beacon-….json` in `rocket-….json` umbenennen.
   **`Data/beacon/tresor.key` nach `Data/rocket/tresor.key`
   mitkopieren** (0600) — ohne ihn sind die Zugangsdaten im Abzug nicht
   zu lesen, und SMTP, IMAP, Sprachmodell und Suche müssen neu
   eingetragen werden.
3. Rocket über den Markt installieren (neuer Katalogeintrag, siehe
   „Veröffentlichen").
4. Erste Anmeldung — sie spielt den neuesten Abzug zurück
   (`auth._einrichten`). Bestand nachmessen (siehe unten).
5. Was von außen auf Beacon zeigt, auf die neue Adresse umstellen: die
   Webhook-Adresse in Insilo (`https://fdfedc010.…/api/eingang/<quelle>`),
   Relay, und wer `X-Beacon-*`-Kopfzeilen schickt, schickt jetzt
   `X-Rocket-*`. Links in bereits verschickten Mails (Abmelden,
   Einwilligung) zeigen weiter auf `…41b89d101.` und laufen ins Leere,
   sobald Beacon weg ist.
6. Erst dann Beacon deinstallieren.

## Seit 0.2.0: Beacon, vorher aicrm

Seit dem Abend des 5. September ist die Box aus dem **Aimighty-Katalog**
installiert (`market_source: market.aimighty`), nicht mehr per Upload —
neue Versionen kommen über Markt → *Updates*. Der Wechsel war eine
Deinstallation plus Installation; der Abzug in `Data/beacon/sicherungen`
hat den Bestand zurückgebracht. „My Olares“ zeigt je Reiter nur die Apps
der jeweiligen Quelle; der Katalog selbst steht im Reiter „AI“ und in der
Suche.

Am 5. September 2026 wurde das Produkt von **aicrm** in **Beacon**
umbenannt — Repo (`ska1walker/beacon`, GitHub leitet die alte Adresse
um), Abbilder (`ghcr.io/ska1walker/beacon-*`), Olares-Name, Namespace
(`beacon-<nutzer>`), Datenbank und Katalogeintrag. Was bleibt: die
Kopfzeilen `X-Aicrm-*` am Eingang (Alias) und die Lesbarkeit alter
Abzüge `aicrm-*.json`.

**Eine Umbenennung ist auf Olares eine Neuinstallation.** Die Kennung
ist `md5(<appname>)[:8]`, für Beacon `41b89d10`; die App hieß
`https://41b89d100.<nutzer>.<zone>`, der öffentliche Pfad `…101.`. So
lief der Umzug auf Kais Box, in dieser Reihenfolge: frischer Abzug über
`POST /api/sicherung`; Ablage `Data/beacon/sicherungen` von Hand angelegt
(uid 1000) und die Abzüge aus `Data/aicrm/sicherungen` hineinkopiert;
Beacon über den Markt installiert; erste Anmeldung — sie spielt den
neuesten Abzug zurück (`auth._einrichten`); Bestand nachgemessen;
erst dann aicrm deinstalliert.

Beim Nachmessen nicht hereinfallen: `select count(*)` ohne
Nutzerkontext liefert unter `FORCE ROW LEVEL SECURITY` immer 0. Zählen
nur über `acquire_as(<nutzer>)` — und `deleted_at` beachten, der Abzug
trägt auch weich Gelöschtes.

## Lokal aufsetzen

Voraussetzungen: PostgreSQL 16, Python 3.11+, Node 22+.

```bash
# 1. Datenbank
brew services start postgresql@16
psql -d postgres -c "create role rocket login password 'rocket_dev_only';"
psql -d postgres -c "alter role rocket createdb;"   # nur für die Tests
createdb -O rocket rocket
```

**Die Rolle darf kein Superuser sein, und die Migrationen laufen mit
genau dieser Rolle.** Beides ist keine Förmlichkeit:

- Ein **Superuser umgeht die Zeilensicherheit vollständig**, auch das
  `force row level security` aus Migration 0002. Eine Einrichtung mit
  Superuser sieht funktionierend aus und trennt die Mandanten nicht.
- Läuft die Migration unter einer *anderen* Rolle, gehören die Tabellen
  dieser anderen Rolle. Die Anwendung ist dann Nicht-Eigentümerin, und
  die Erstanlage von Nutzer und Organisation scheitert an den Policies
  auf den Identitätstabellen. Auf der Box gehören die Tabellen der
  injizierten Rolle — die lokale Einrichtung bildet das nach.

```bash
# 2. Schema
PGPASSWORD=rocket_dev_only psql -h localhost -U rocket -d rocket \
  -f supabase/migrations/0001_initial_schema.sql
PGPASSWORD=rocket_dev_only psql -h localhost -U rocket -d rocket \
  -f supabase/migrations/0002_rls_policies.sql

# 3. Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --port 8000

# 4. Oberfläche
cd frontend && npm install
BACKEND_URL=http://localhost:8000 npm run dev

# 5. Beispieldaten
python3 scripts/seed-dev.py
```

`backend/.env` trägt lokal `DEV_USER=kai`. Ohne Envoy gibt es keinen
`X-Bfl-User`-Kopf; dieser Wert tut so, als wäre jemand angemeldet. **Auf
der Box bleibt er leer** — dort ist ein fehlender Kopf ein Fehler und kein
Anlass, jemanden zu erfinden.

## Tests

```bash
cd backend && .venv/bin/python -m pytest
```

Die Tests legen eine eigene Datenbank `rocket_test` an, spielen die
Migrationen ein und werfen sie danach weg. Sie laufen gegen echtes
Postgres, nicht gegen Attrappen — die Zeilensicherheit ist der Kern
dessen, was geprüft wird, und die gibt es nur in einer echten Datenbank.

Der wichtigste Test ist `test_mandanten_sehen_einander_nicht`. Er wurde
gegengeprüft: Nimmt man das `force row level security` aus Migration 0002
heraus, schlägt er fehl, und zwar mit „die eine Organisation sieht die
Firmen der anderen". Genau dieser Fehler wäre sonst erst aufgefallen,
wenn zwei Leute auf derselben Box arbeiten.

## Chart prüfen

```bash
bash scripts/check-chart.sh
```

Prüft Versionsgleichlauf, Namensgleichheit, verbotene Konstrukte
(`.Files.Get`, Helm-Hooks, NodePort), die Herkunft des Image-Tags und ob
die Migrations-ConfigMap noch zur Quelle passt. Läuft `helm lint` und
`helm template` mit.

Nach jeder Änderung an `supabase/migrations/`:

```bash
python3 scripts/regen-migrations.py
```

## Was auf der Box bewiesen ist

Bis zum 3. September 2026 stand hier, das Chart sei nie auf einer echten
Olares-Box gelaufen. Das gilt nicht mehr: Rocket läuft seit dem 3.9. auf
Kais Box, seit dem 5.9. aus dem Aimighty-Katalog (siehe oben). Das
Zusammenspiel mit dem injizierten Postgres, das Zeitfenster bis zum
`ns-owner`-Label, der Envoy vor der Oberfläche und der Weg von
`X-Bfl-User` durch die Next.js-Weiterleitung sind damit im Betrieb
geprüft — die Stolpersteine dabei stehen in den jeweiligen Abschnitten.

Die Reihenfolge bei jeder Veröffentlichung bleibt: erst die Abbilder
bauen und nach GHCR schieben, dann das Chart. Für den Ablauf gibt es im
Insilo-Repo den Skill `olares-release`.

## Was unter /app/data liegt

Drei Dinge, und `/app/data` ist der einzige Pfad, den Olares als dauerhaft
zusichert — er überlebt eine Deinstallation, die **Datenbank nicht**.

| | Was |
|---|---|
| `sicherungen/` | Der Abzug als JSON, nach jeder Änderung neu (spätestens alle sechs Stunden), die letzten 14 Stände nebeneinander |
| `podcasts/` | Die erzeugten Gesprächsvorbereitungen als MP3 |
| `tresor.key` | Der Schlüssel für die Zugangsdaten, 0600 |

**Der Abzug enthält alles, was ein Mensch in Rocket ändert.** Gemessen am
9. September: 21 Tabellen mit Inhalt (Firmen, Kontakte, Geschäfte,
Aufgaben, Tickets, Angebote, Kampagnen, Mails, Eigenschaftsdefinitionen,
Webhook-Quellen, Protokoll), dazu die 66 Felder der Organisation
(Briefkopf, SMTP, IMAP, Sprachmodell, Suche, Sprachausgabe, Fristen) und
je Person Name, Kennung, Rolle, Favoriten, Passwort-Hash und die
Absendereinstellungen.

**Zwei Wachen halten das fest.** Auf Tabellenebene bricht ein Test ab,
sobald eine neue Tabelle weder im Abzug steht noch ausdrücklich
ausgenommen ist. Auf **Spaltenebene** dasselbe für `users` — und die
zweite gibt es, weil die erste nicht ausreichte: Die Absenderadressen aus
0.6.5 hingen an `users`, und `users` steht ausdrücklich in `AUSGENOMMEN`.
Sie fehlten still im Abzug, bis jemand danach fragte.

**Die Zugangsdaten stehen im Abzug verschlüsselt** (seit 0.6.6). Damit
gehören Abzug und `tresor.key` zusammen: Wer den Ordner sichert, sichert
beides — wer nur die JSON-Dateien mitnimmt, hat die Zugangsdaten nicht.

Nicht im Abzug, mit Absicht: Sitzungen und Anmeldeversuche (eine
zurückgespielte Sitzung wäre ein Wiedereinspielen von Zugängen),
`created_at`, `last_seen_at` und `deleted_at` (entstehen neu) sowie
`gesperrt_bis` (eine Bremse von gestern erbt niemand).

## Sicherung

Eine Deinstallation über den Markt löscht die Datenbank. `/app/data`
überlebt sie, die Datenbank nicht.

Dagegen schreibt die Anwendung alle sechs Stunden einen vollständigen
Abzug nach `/app/data/sicherungen/` und liest ihn beim ersten Start nach
einer Neuinstallation von allein zurück. Der Abzug liegt mit Rechten
0600, weil er den Schlüssel zum Sprachmodell enthält.

Zwei Dinge, die man wissen muss:

- **Zurückgespielt wird nur in die erste Organisation der Box.** Meldet
  sich ein zweiter Mensch an, bekommt er eine leere Organisation. Ohne
  diese Bedingung wäre der Wiederanlauf ein Leck zwischen Mandanten.
- **Wiederherstellen überschreibt nichts.** Was heute da ist, bleibt; es
  wird nur ergänzt, was fehlt. Die Antwort nennt beide Zahlen getrennt.

Die Ausfuhr unter *Einstellungen → Sicherung* lädt denselben Abzug
herunter — **ohne** den Schlüssel zum Sprachmodell, denn diese Datei
verlässt die Box.

Von Hand geht weiterhin:

```bash
pg_dump -h <box> -U rocket rocket > rocket-$(date +%F).sql
```

**Seit 0.3.2: Sicherung nach jeder Änderung, samt Einstellungen.**
Die Schleife sieht alle fünf Minuten nach (`sicherung_pruefung_minuten`)
und schreibt nur, wenn sich der Fingerabdruck des Abzugs bewegt hat
(`abzug_kennung`, ohne Zeitstempel) — spätestens nach
`sicherung_intervall_stunden`, und einmal beim Herunterfahren. Der Abzug
trägt jetzt auch `listen`, `listen_mitglieder`, `vorlagen`, `kampagnen`
und `audit_log`; ein Test (`test_jede_tabelle_ist_im_abzug_oder_ausdruecklich_nicht`)
bricht, sobald eine neue Tabelle weder in `TABELLEN` noch in
`AUSGENOMMEN` steht. Die Spalten, die auf `users` zeigen, kommen aus den
Fremdschlüsseln der Datenbank (`_nutzerspalten`), nicht mehr aus einer
Liste — die hatte `anreicherungen.created_by` vergessen, und jede
Wiederherstellung mit einem Anreicherungslauf wäre daran gescheitert.

**Die Einstellungen werden zurückgespielt.** Bis 0.3.1 standen sie im
Abzug, kamen aber nie zurück: Sprachmodell, Suchdienst, SMTP, Postfach
waren nach einer Neuinstallation weg. Beim Wiederanlauf (erste Anmeldung
in eine leere Datenbank) gelten sie ganz (`frisch=True`), bei einer
Wiederherstellung von Hand füllen sie nur leere Felder.

**Doppelte Ticket-Pipelines.** Bis 0.3.1 prüfte der Start ohne
Nutzerkontext, ob eine Ticket-Pipeline da ist; unter Zeilensicherheit
sah er nie eine und legte bei jedem Start eine weitere „Anliegen“ an —
auf Kais Box waren es 16. Der Start prüft jetzt mit Kontext und räumt
Dubletten ohne Tickets weg (`_ticketpipelines_bereinigen`), die älteste
bleibt.

## Insilo anschließen

Insilos Protokolle landen **unter Besprechungen**, nicht im Eingang
(seit 0.10.0). Zwei Wege führen dorthin, und beide treffen über Insilos
Besprechungskennung dieselbe Zeile — kommt ein Gespräch auf beiden, bleibt
es eines:

| | Gemeinsamer Ordner (seit 0.11.0) | Webhook (seit 0.10.0) |
|---|---|---|
| Wann | Insilo auf **derselben** Box | Insilo auf einer anderen Box, oder Protokolle nur für Rocket |
| Einrichtung | keine | Quelle anlegen, in Insilo eintragen, auf automatisch stellen |
| Wer die Protokolle sieht | jede App der Box mit `appCommon` (Relay, ComfyUI, Ollama …) | nur Rocket, signiert |
| Löschen, Ändern | Datei weg bzw. neu geschrieben | eigene Ereignisse |
| Tempo | alle 2 Minuten | sofort |

### Über den gemeinsamen Ordner — wie Relay

Insilo legt seit 0.1.93 jedes fertige Protokoll als Datei in den geteilten
Olares-Ordner, `/olares/rootfs/Common/insilo-meetings` auf der Box
(`insilo/backend/app/relay_drop.py`). Relay liest dort mit, Rocket seit
0.11.0 auch (`app/insilo_ablage.py`). Das Chart hängt **nur diesen
Unterordner** ein, **nur lesend**, unter `/app/insilo`; geschrieben wird
er allein von Insilo.

- **Vertrag, schema 1**: eine Datei je Besprechung,
  `<YYYY-MM-DD>T<HH>_<MM>--<id8>.md`. Vorne ein Kopf (`insilo_id`, Titel,
  Aufnahmezeit, Dauer, Teilnehmer, Schlagworte, Vorlage), dahinter Insilos
  Markdown **ohne Wortlaut** mit eigenem Kopf. Ein anderes Schema liest
  Rocket nicht und zählt die Datei als „unbekanntes Format".
- **Nur Kundengespräche (seit 0.12.0, Insilo ab 0.1.102).** Der Kopf trägt
  `crm: true|false`, festgelegt in Insilo an der Vorlage (*Einstellungen ›
  Vorlagen für Zusammenfassungen*, Voreinstellung: Mandanten-, Vertriebs-
  und Jahresgespräch ja; Allgemeine Besprechung, Schnellnotiz und eigene
  Vorlagen nein). Rocket übernimmt nur `true`; der Webhook trägt dasselbe
  als `meeting.crm`. Gefiltert wird **nicht am Vorlagennamen** — den kann
  eine Organisation in Insilo umbenennen. Fehlt der Schlüssel (älteres
  Insilo), wird wie bisher übernommen; ein unbekannter Wert gilt nicht als
  nein. Schon übernommen und nicht mehr markiert: weich gelöscht
  (`besprechungen.nicht_fuers_crm`), kehrt zurück, wenn die Vorlage wieder
  markiert wird — **außer schon einem Kunden zugeordnet**, das bleibt. Nicht
  markierte Dateien merkt sich der Lauf im Speicher und liest sie
  unverändert nicht erneut. „Jetzt lesen" zählt sie als „nicht als
  Kundengespräch markiert".
- **Keine strukturierte Zusammenfassung.** Die Vorlagenfelder stehen nur
  als Abschnitte im Markdown; „Anwesende", „Kunde", „Mandant" liest
  `_zusammenfassung_aus` zurück — genug für den Vorschlag über Namen.
- **Welche Organisation liest.** Der Ordner gehört der Box.
  `org_settings.insilo_ablage` = an/aus; nicht eingestellt heißt: an, wenn
  Rocket auf der Box genau eine Organisation hat, sonst aus. So braucht
  der Normalfall nichts, und bei zwei Organisationen landen die Gespräche
  nicht still bei beiden.
- **Unverändert wird nicht neu gelesen** (`ablage_stand` =
  Änderungszeit:Größe) — **seit 0.12.1 nur, wenn auch die Lesefassung
  passt** (`ablage_fassung`, `insilo_ablage.LESEFASSUNG`). Auf Kais Box am
  16.9.2026: Insilo 0.1.102 schrieb die Dateien mit `crm:` neu, das noch
  laufende Rocket 0.11.0 las sie, kannte die Markierung nicht und
  speicherte den neuen Stand; 0.12.0 hielt sie danach für unverändert und
  zog keine der 14 internen Besprechungen zurück. Wer ändert, *wie* eine
  Datei gelesen wird, hebt `LESEFASSUNG` — dann liest das neue Rocket nach
  dem Update einmal alles. **Eine Datei, die fehlt, heißt „in Insilo
  gelöscht"** — Besprechung und Aktivität werden weich gelöscht. **Ein
  leerer Ordner löscht nichts**: Er sieht genauso aus wie einer, der nach
  einer Neuinstallation noch nicht gefüllt ist.
- **Einstellungen › AI und Programme › Insilo auf dieser Box** zeigt, wie
  viele Protokolle im Ordner liegen, wie viele übernommen sind und wann
  zuletzt gelesen wurde. „Jetzt lesen" beweist die Einrichtung. Dort
  steht auch die Adresse von Insilo für „In Insilo öffnen" — die Datei
  trägt keine (`source_url` ist leer).
- **Altbestand**: Insilo exportiert nur, was nach 0.1.93 fertig wurde. Am
  15.9.2026 lag genau eine Datei im Ordner. Ältere Besprechungen schreibt
  Insilos Nachzug `POST /api/v1/meetings/export-backfill` (Inhaber oder
  Verwaltung, höchstens 500 je Aufruf).
- **Auf der Box gemessen, 15.9.2026**: Insilos `userspace.appCommon` ist
  `/olares/rootfs/Common` — **ohne Nutzernamen**, also für die ganze Box.
  Relay hängt `…/Common/insilo-meetings` lesend ein. Dass eine
  Bestandsinstallation die neue Berechtigung per Markt-Upgrade bekommt,
  spricht Insilos Helm-Historie (Upgrade von 0.1.88 bis 0.1.98 ohne
  Neuinstallation, danach `appCommon` gesetzt); belegt ist es für Rocket
  erst nach dem Upgrade auf 0.11.0. Das Chart liest den Wert deshalb
  bedingt: Fehlt er, bleibt der Weg aus und der Block sagt es.

### Über einen Webhook

Nach einer Besprechung schickt Insilo ein signiertes Ereignis mit dem
fertigen Protokoll. Der Vertrag steht in `insilo/docs/WEBHOOKS.md` und
wird eingehalten, nicht neu erfunden. Im Insilo-Pod löst Rockets Adresse
auf die LAN-Adresse der Box auf (`192.168.1.17`), der Aufruf geht also
nicht über den FRP-Server nach draußen (gemessen 15.9.2026).

#### Einrichten

1. In Rocket unter *Einstellungen › AI und Programme › Verbundene
   Programme* eine Quelle der Art „Insilo — Besprechungen" anlegen.
   Adresse und Geheimnis werden **einmal** gezeigt.
2. In Insilo unter *Einstellungen › Webhooks* beides eintragen, Ereignis
   `meeting.ready`, **Auslösung automatisch**. In der Vorgabe steht ein
   neuer Webhook in Insilo auf „manuell" (`trigger_mode = 'manual'`,
   Migration 0008) — dann kommt nur an, was jemand in Insilo mit „An
   externe Systeme senden" losschickt. Schnellnotizen gehen immer.
3. Zurück in Rocket die **Adresse von Insilo** an der Quelle eintragen
   (`https://e5d605f30.<nutzer>.olares.de`). Dann führt jede Besprechung
   mit „In Insilo öffnen" nach `/m/<kennung>`.
4. In Insilo „Test" drücken — Rocket antwortet 200 und legt nichts an.

#### Gemessen am 15. September 2026

Der Webhook scheiterte am 5.9. an der Login-Umleitung des
`internal`-Eingangs (siehe unten). Seit 0.6.9 ist Rockets Eingang
`public`, und die Umleitung ist weg:

| Weg | Antwort |
|---|---|
| Rocket-Pod → `insilo-backend.insilo-kaivostudio:8000` im Cluster | Zeitüberschreitung — NetworkPolicy |
| Insilo-Pod → `https://41b89d100.kaivostudio.olares.de/api/eingang/<quelle>` | **401 „Unbekannte oder abgeschaltete Quelle"** — Rocket selbst |
| Insilo-Pod → `…41b89d101…` (`rocketlinks`) | 404 — der Links-Dienst kennt den Eingang nicht |

Die 401 kommt aus Rockets Code, nicht vom Gateway. Der Weg ist also offen,
und die Signatur ist das Tor. Kein neuer Transport, kein
Service-Provider, kein Abholen nötig.

### Warum ein eigener Bereich und kein Eingang

Der Eingang ist eine Warteschlange, die leer werden soll. Besprechungen
sind ein Archiv, das man durchsucht und nach Datum liest. Im Eingang
verschwand ein Gespräch nach dem Zuordnen, und wer es später suchte, fand
es nur noch in der Zeitleiste irgendeines Kunden. Zuordnung ist hier eine
**Eigenschaft** der Besprechung. Der Reiter „Ohne Kunde" ist die
Aufräumansicht, die Marc vorschlug (15.9.2026). Der Eingang behält Post
und Meldungen.

### Zwei Regeln

**Protokoll ja, Wortlaut nein.** Rocket behält Insilos Markdown ohne
Frontmatter und ohne den Abschnitt `## Volltranskript`
(`besprechungen.protokoll_aus`), dazu die strukturierte Zusammenfassung
und die genannten Namen. Die rohe Nutzlast wird **nicht** abgelegt — sie
enthielte den Wortlaut. Ein Vertrieb liest das Protokoll; wer den genauen
Satz braucht, öffnet Insilo. Dieselbe Regel, die Insilo selbst für den
Relay-Export hat (`relay_drop._inhalt`). Die Migration 0030 hat den
Wortlaut auch aus den Aktivitäten entfernt, die vorher schon angelegt
waren.

**Nie automatisch zugeordnet.** Bis 0.9.9 legte ein Firmenname im Titel
das Protokoll ungefragt an den Lead. Jetzt schlägt Rocket vor, ein Mensch
bestätigt — ein eindeutiger Treffer ist vorausgewählt, Bestätigen ist ein
Klick. Insilo kennt von den Beteiligten nur Namen, keine E-Mail, und zwei
Kontakte heißen Meyer.

### Wie der Vorschlag entsteht

Zweistufig (`app/besprechungen.py`):

1. **Über Namen, sofort beim Empfang.** Die Sprecher aus dem Frontmatter
   (ohne `SPEAKER_00`) und die Vorlagenfelder `anwesende`, `kunde`,
   `mandantenname` … gegen den Bestand. Der **Nachname** muss stimmen
   (`namen.namensteile`); stimmt auch der Vorname, gewinnt der Treffer.
   Firmen über `firmenschluessel` in Titel, Schlagworten und Kundenfeld.
   Passt ein Name auf mehrere Kontakte, gibt es **keine Vorauswahl**, nur
   die Kandidaten mit ihrer Firma — außer die übrigen Hinweise stehen auf
   genau einer Firma, dann zählt der Meyer dieser Firma.
2. **Über das Modell, im Hintergrund**, nur wenn die Namen gar nichts
   ergaben. Es bekommt die Zusammenfassung und höchstens 40 Firmen, deren
   Name mit dem Gespräch ein Wort teilt, samt deren Kontakten. Jede
   Kennung in der Antwort muss aus dieser Liste stammen. Bei einer
   Mehrdeutigkeit fragt Rocket das Modell nicht — es sähe dieselben zwei
   Meyers und müsste raten.

Zugeordnet wird als **eine** Aktivität `meeting` mit Firma, Lead und dem
ersten Kontakt; an den übrigen Beteiligten steht sie über
`besprechung_kontakte`. Eine Aktivität je Kontakt ergäbe an der Firma
dasselbe Gespräch dreimal. In der Zeitleiste steht ein Anriss mit
„Protokoll ansehen"; bearbeitet und gelöst wird an der Besprechung.

Alte Insilo-Posten aus dem Eingang zieht die Migration 0030 um. Sie tragen
keine Beteiligten, weil der Eingang die nie auswertete — dort hilft „Neu
vorschlagen" nur über den Titel.

> **Geprüft am 5. September 2026, zweimal — die erste Messung war
> falsch, und zwar am Hostnamen.** Olares adressiert einen Entrance nicht
> unter seinem Namen, sondern als `<appid><index>.<nutzer>.<zone>`:
> `appid` ist `md5(<appname>)[:8]` (damals für aicrm `4d3bf559`, auf jeder Box
> gleich), `index` die Position im Manifest, null-basiert. Systemapps wie
> `files.` oder `market.` tragen Namen — Nutzerapps nicht. Alles, was
> vorher unter `rocket.kaivostudio.olares.de` gemessen wurde, traf einen
> Hostnamen, den es nie gab; das 421 war die Antwort des Gateways auf
> einen unbekannten Host, keine Aussage über `authLevel`.
>
> Gemessen von außen, ohne Anmeldung, `GET /health`:
>
> | Entrance | authLevel | Adresse | Antwort |
> |---|---|---|---|
> | `rocket` (Index 0) | `internal` | `4d3bf5590.kaivostudio.olares.de` | **302** zur Anmeldung |
> | `rocketlinks` (Index 1) | `public` | `4d3bf5591.kaivostudio.olares.de` | **200** `{"status":"ok","teil":"oeffentlich"}` |
> | litellm `litellmapi` | `public` | `6aead52a1.…` und `llm.…` (eigener Name) | 401 von LiteLLM — durchgereicht |
>
> Über den öffentlichen Entrance: unbekanntes Token → 404, `/api/contacts`
> → 404. Der Container auf 8001 kennt die interne API nicht.
>
> Ein `internal`-Entrance hat also eine öffentliche Adresse; wer ohne
> Sitzung kommt, wird zur Anmeldung geschickt. Ob eine `policies`-Regel
> einen Pfad darunter für anonyme POSTs öffnet, ist damit **nicht
> gemessen** — die frühere Gegenprobe lief auf dem falschen Host. Der
> Insilo-Anschluss scheiterte an genau dieser Umleitung, nicht an einer
> fehlenden Tür.
>
> **Der zweite Entrance verschiebt die Adresse der App.** Mit nur einem
> Entrance hieß die App `4d3bf559.kaivostudio.olares.de` (ohne Index — so
> stand es auch in den eingefrorenen Helm-Werten der Erstinstallation).
> Seit dem zweiten Entrance heißt der erste `4d3bf5590.…`, und die alte
> Adresse antwortet 421 (gemessen 5.9.2026). Ein Lesezeichen auf die
> alte Adresse ist damit tot; der Weg über den Olares-Desktop stimmt.
> Wer noch einen Entrance hinzufügt, verschiebt nichts mehr — der Index
> bleibt.
>
> **Ein Entrance am Backend-Pod legt die App lahm.** Der Sidecar, den
> ein Entrance mitbringt, prüft *jeden* eingehenden Aufruf gegen Authelia
> — auch die des Frontends an `rocket-backend:8000/api`. Mit 0.1.10 hing
> `rocketlinks` am Backend-Pod; nach dem Markt-Upgrade antwortete jede
> API-Anfrage 401 (`ext_authz_denied` im Sidecar-Log), die Oberfläche
> zeigte „Anfrage fehlgeschlagen (401)“. Seit 0.1.12 hat der öffentliche
> Pfad sein eigenes Deployment `rocket-links`; das Backend bleibt ohne
> Entrance und ohne Sidecar. Regel: **Ein Entrance zeigt nur auf Pods, die
> sonst niemand aus dem Cluster aufruft.**
>
> **Was ein neuer Entrance bei einem Upgrade braucht.** `helm upgrade`
> tauscht die Workloads, liest aber das Manifest nicht neu ein: Nach dem
> Ausrollen von 0.1.10 per Helm fehlte `rocketlinks` in `spec.entrances`,
> und der Backend-Pod hatte keinen Envoy-Sidecar. Erst das Upgrade über
> den Markt (Upload-Quelle) trug den Entrance ins Application-Objekt, in
> `spec.settings.policy` und injizierte den Sidecar in den nächsten Pod.
> Ein neuer Entrance kommt deshalb **nur über den Markt** auf eine Box;
> `scripts/box-abgleich.py` zeigt Manifest und Objekt nebeneinander und
> nennt die echten Adressen.
>
> Ein Rest bleibt, und der liegt bei Olares: `status.entranceStatuses`
> wird nur beim ersten Anlegen aus dem Manifest gefüllt
> (`application_controller.go`, `createApplication`); `updateApplication`
> überschreibt `spec.entrances`, fasst den Status aber nicht an, und der
> `EntranceStatusManagerController` aktualisiert nur Einträge, die schon
> da sind. Nach einem Upgrade fehlt der neue Entrance im Status — für
> die Erreichbarkeit ist das **ohne Belang** (gemessen: Eintrag entfernt,
> 200; Eintrag gesetzt, 200), er fehlt nur in der Statusanzeige des
> Markts. Auf Kais Box wurde der Eintrag von Hand nachgetragen, so wie
> eine Neuinstallation ihn schreiben würde.

> Bis 0.6.9 standen hier zwei Auswege — Service-Provider und „Rocket holt
> selbst". Beide braucht es nicht mehr: Mit dem öffentlichen Eingang kommt
> Insilos Webhook an (Messung vom 15.9.2026 oben).


## Versand — SMTP, Einwilligung, öffentliche Links

Seit 0.1.11 schickt Rocket selbst: über ein gewöhnliches SMTP-Konto
(*Einstellungen → Versand*). Daraus kommen Ticket-Antworten, die
Bestätigungsmail (Double-Opt-In) und die Ansprache aus dem Kontakt.
Marketing-Post ist davon getrennt (*Marketing-Versand*: dasselbe Konto
oder Brevo) — HubSpot trennt beides aus demselben Grund: Ein gesperrtes
Marketing-Konto darf keine Antwort an einen Kunden aufhalten.

**Der Knopf „Testmail an mich“ ist der Beweis.** Zugangsdaten, die erst
bei der ersten Antwort scheitern, sind keine Einrichtung. Was scheitert,
steht als *Letzter Versuch* im Block und in `mails.fehler`.

**Jede Mail ist zuerst eine Zeile in `mails`, dann ein Versand.** Ein
abgelehnter Versand bleibt mit Grund stehen und wird dreimal mit
wachsendem Abstand wiederholt (`app/versand.py`, Schleife in `main.py`,
alle 30 s). Erst dann `fehlgeschlagen`. Ticket-Uhr und Verlauf werden
erst geschrieben, wenn die Mail wirklich draußen ist — eine Antwort, die
nicht ankam, ist keine.

**Der Faden.** Kam ein Ticket per Mail (Postfach oder Eingang), trägt die
Antwort `In-Reply-To`/`References` mit der Message-ID der Anfrage, und
die Kennung `[T-2026-0042]` steht im Betreff. Danach: erste Antwort
festgehalten, Ticket in „wartet auf Kontakt“.

**Einwilligung.** Marketing-Post geht nur an `bestaetigt` oder
`bestandskunde`. `bestaetigt` entsteht ausschließlich über den Link in
der Bestätigungsmail (sieben Tage gültig, einmalig); es gibt bewusst
keinen Knopf dafür. `bestandskunde` (§7 Abs. 3 UWG) setzt ein Mensch am
Kontakt, mit Namen im Beleg. Jede Marketing-Mail trägt den Abmeldelink
in `List-Unsubscribe` und im Text; der Link funktioniert immer.

**Die Adresse der öffentlichen Links** (Bestätigen, Abmelden, Klick) ist
`https://<appid>1.<nutzer>.<zone>` — der zweite Entrance. Das Chart reicht
`.Values.domain.rocket` als `APP_DOMAIN` ins Backend, das Backend leitet
daraus ab; *Einstellungen → Marketing-Versand* zeigt, was gilt, und
erlaubt einen eigenen Wert (eigene Domain, oder eine Box, die ihre
Domain nicht mitteilt). Ohne Adresse geht keine Bestätigungsmail hinaus,
und der Block sagt das.

## Jeder unter seinem eigenen Namen — Absenderadressen

Bis 0.6.4 hatte eine Organisation genau **einen** Absender
(`org_settings.smtp_absender`). Sobald zwei Menschen in einem Bestand
arbeiten, ist das falsch: Marcs Angebot ging als Kai hinaus, und der
Empfänger sah einen Namen, mit dem er nie gesprochen hatte.

Seit 0.6.5 trägt jeder Mensch seine eigene Adresse — unter *Einstellungen ›
E-Mail › Ihre Absenderadresse*. Jeder setzt **nur seine eigene**; der Pfad
`PUT /api/mitglieder/wer/absender` kennt keine Kennung, sondern nur „wer
gerade handelt".

### Zwei Wege, und die Wahl trifft der Mailanbieter

**Eigene Adresse auf dem Konto der Organisation.** Nur `From` wechselt,
angemeldet wird weiter mit dem Konto aus den Einstellungen. Ein Feld, und
es funktioniert bei Anbietern, die eine fremde Absenderadresse derselben
Domain durchlassen. Manche tun das nicht — one.com etwa weist je nach
Tarif eine `From` zurück, die nicht dem angemeldeten Postfach entspricht.
Dann steht der Grund in der Zeile in `mails`, nicht im Verborgenen.

**Eigene Zugangsdaten.** Wer sein eigenes Postfach hat, trägt Server,
Benutzer und Passwort ein und meldet sich selbst an. Das geht immer,
kostet aber ein Postfach je Person.

### Die Domainschranke ist kein Formalismus

Auf dem gemeinsamen Konto ist nur eine Adresse **derselben Domain**
erlaubt. Ohne diese Schranke könnte jedes Mitglied über das Konto der
Organisation als beliebige Adresse schreiben — als der Geschäftsführer
eines Kunden zum Beispiel. Wer eigene Zugangsdaten hinterlegt, meldet sich
selbst an und darf deshalb führen, was sein Anbieter durchlässt. Geprüft
wird beim Speichern **und** beim Versand.

### Wer schickt, hängt an `mails.created_by`

Nicht daran, wer die Schleife anstößt. Sonst ginge Marcs Angebot als Kai
hinaus, sobald Kai als Nächster etwas versendet. Dieselbe Kennung schreibt
auch die Absenderadresse: die angemeldete Person selbst.

**Marketing bleibt beim Absender der Organisation.** Eine Kampagne kommt
von der Firma, nicht von einem Menschen, und der Abmeldelink hängt an
derselben Adresse.

### Die Antwort soll im Bestand landen

Rocket liest genau **ein** Postfach je Organisation. Schickt jemand unter
eigener Adresse, käme die Antwort dort an, wo niemand sie einliest — der
Faden im CRM bliebe stumm. Deshalb trägt jede Mail `Reply-To` auf das
Postfach der Organisation, **sofern eines eingerichtet ist**. Ist keines
da, sagt die Einstellungsseite genau das, statt etwas zu versprechen.

Tests: `backend/tests/test_versand.py` — Hausadresse ohne Eintrag, nur das
`From` wechselt, fremde Domain abgewiesen, eigene Zugangsdaten führen
alles, kein Hauskonto hilft nicht, `Reply-To` gesetzt und bei gleicher
Adresse weggelassen, und der ganze Weg mit zwei Menschen über ein Konto.

## Suchen oder fragen

Seit 0.2.4 ein Feld für beides, links unter der Marke, ⌘K/Strg+K von
überall. Beim Tippen kommen sofort Treffer über Firmen, Kontakte,
Geschäfte, Tickets, Listen und Kampagnen (`/api/suche`, `ilike`, fünf je
Art, nach Aktualität) — das kostet nichts. Sieht der Text wie eine Frage
aus (Fragezeichen oder vier Wörter), steht darunter „Frage stellen ↵“;
erst dann läuft das Modell über `/api/fragen`, und die Antwort mit
Fundstellen erscheint in der Palette. Die Seite „Fragen“ bleibt als
Verlauf; die Suchfelder in den Listen bleiben, sie sind Filter.

## Listen und Kampagnen

Seit 0.2.1. Eine **Liste** sagt, wen man meint — statisch (von Hand
gefüllt, auch per Stapel aus der Kontaktliste) oder aktiv (ein Filter im
Format der Ansichten; wer passt, ist drin). Ob man jemandem schreiben
darf, sagt der **Kontakt** (`marketing_einwilligung`, jetzt auch als
Filterfeld). Eine **Kampagne** ist Betreff, Text und Liste; beim Start
schreibt sie jedem berechtigten Empfänger eine Zeile ins Buch (`mails`,
`art = marketing`), die Schleife schickt. Wer keine Einwilligung oder
Adresse hat, wird übergangen und gezählt — die Liste bleibt unangetastet.

Jeder Link im Text wird je Empfänger zu einem Klick-Link
(`oeffentliche_links`, `art = klick`, mit `kampagne_id`), der Abmeldelink
hängt ebenfalls an der Kampagne. Kennzahlen (gesendet, wartend,
fehlgeschlagen, Klicks, Klicker, abgemeldet) entstehen beim Lesen aus
den Zeilen; `abgeschlossen` ist `laeuft` ohne wartende Zeile. Marketing-
Post geht über das SMTP-Konto oder — wenn gewählt und eingerichtet —
über Brevo (`app/versand.py`, `marketing_konto`). Vorlagen sind Betreff
und Text mit Platzhaltern, mehr nicht.

Die Einstellungen sind seit 0.2.1 in fünf Unterpunkte gegliedert (Firma
und Team, Vertrieb, E-Mail, AI und Programme, Daten); jeder Block sagt in
einem Satz, wozu er da ist, und hält das Kleingedruckte hinter dem
Symbol (`components/erklaerung.tsx`).

## Post anschließen — Relay oder ein anderer Dienst

> **Seit 0.2.2 ist die Art einer Quelle Teil des Vertrags.** Eine Quelle
> der Art `relay` öffnet nur `/api/post/eingang/<id>`; `insilo`, `api`,
> `bot`, `formular` öffnen nur `/api/eingang/<id>`; `email` ist das eigene
> Postfach und öffnet nichts. Passt die Art nicht, antwortet der Pfad 401
> — dieselbe Antwort wie bei falscher Signatur. Bestehende Quellen tragen
> die Vorgabe `insilo` und laufen weiter; die Prüfung steht als
> `CHECK … NOT VALID`, weil die Migration unter FORCE RLS alte Zeilen
> weder lesen noch berichtigen kann.
>
> **Ausgehende Post trägt `X-Post-Delivery-ID`** (aus `delivery_id` im
> Auftrag, sonst vom Server vergeben) und wird bei Ausfall oder 5xx bis
> zu dreimal mit Pausen von 1 s und 3 s wiederholt — stets mit derselben
> Kennung. Ein zweiter Auftrag mit derselben Kennung schickt nichts mehr,
> sondern liefert den vorhandenen Verlaufseintrag (`wiederholung: true`).
> Die `message_id` aus der Antwort des Dienstes steht am Verlaufseintrag
> (`payload.message_id`) — die Grundlage für jedes spätere `in_reply_to`.

E-Mails gehen nicht aus Rocket selbst hinaus und kommen nicht direkt
herein. Beides läuft über einen Dienst auf der Box — Marcs Relay, die
Outlook-Alternative. Weil dessen Schnittstelle beim Bau nicht vorlag,
gilt ein **eigener, kleiner Vertrag**, denselben Bauplan wie beim
Insilo-Eingang: signierter POST, HMAC-SHA256 über den rohen Body,
Idempotenzschlüssel. Er steht in `backend/app/routers/post.py`.

**Hinein** — der Dienst ruft `POST /api/post/eingang/<Quelle>` mit den
Kopfzeilen `X-Post-Event: mail.received`, `X-Post-Delivery-ID`,
`X-Post-Signature: sha256=…` und dem Body
`{"message_id","from","to":[…],"subject","text","received_at"}`. Die
Quelle wird unter *Einstellungen → Eingehende Quellen* angelegt (Art
`relay`), das Geheimnis einmalig gezeigt. Kennt das CRM die
Absenderadresse, liegt die Mail als Verlaufseintrag am Kontakt; sonst
wartet sie im Eingang.

**Hinaus** — Rocket schickt an die unter *Einstellungen → Postausgang*
eingetragene Adresse einen signierten POST mit
`{"to","from","subject","text","in_reply_to","sent_at"}` und der
Kopfzeile `X-Post-Signature`. Der Dienst verschickt; Rocket hält die
Nachricht im Verlauf fest. Nichts geht von allein hinaus — das Modell
entwirft, ein Mensch drückt auf Senden.

> **Offen:** Relays tatsächliche Schnittstelle. Liegt sie vor, ist ein
> kleiner Übersetzer auf Relay-Seite oder eine Anpassung in `post.py`
> nötig — der Vertrag hier ist bewusst so schmal, dass beides ein
> Nachmittag ist.

## Anreicherung anschließen — Suchdienst

Neue Firmen und Kontakte werden von selbst aus öffentlichen Quellen
ergänzt (`backend/app/anreicherung.py`). Ohne Einrichtung liest die
Anreicherung nur die **Website der Firma**: Startseite, Impressum,
Kontakt-, Team- und Über-uns-Seiten, dazu die intern verlinkten Seiten
mit solchen Namen. Das genügt für Anschrift, Telefon, Branche und
Beschreibung — und für Ansprechpartner, die auf der Team-Seite stehen.

Für alles darüber hinaus braucht sie einen **Suchdienst** unter
*Einstellungen → Anreicherung*:

| Dienst | Adresse | Schlüssel |
|---|---|---|
| SearXNG (läuft auf der Box) | `http://searxngv2.searxngv2server-shared.svc.cluster.local:8080` — Rocket hängt `/search?format=json` an | meist keiner; sonst als `Authorization: Bearer` |
| Tavily | `https://api.tavily.com/search` | Pflicht, geht als `Authorization: Bearer` |
| Brave Search | `https://api.search.brave.com/res/v1/web/search` | Pflicht, geht als `X-Subscription-Token` |

**Es gibt kein Auswahlfeld für den Dienst.** Die Adresse sagt eindeutig,
wer am anderen Ende hängt (`Suchdienst.art`); ein Feld mehr wäre ein
Feld, das falsch stehen kann. SearXNG ist der Rest — es läuft auf der
eigenen Box unter einem Namen, den niemand vorhersagen kann.

Die Region wird für jeden Dienst anders geschrieben: Brave nimmt das
Kürzel als `country`, SearXNG die Sprache `de-DE`, Tavily den
ausgeschriebenen Ländernamen (`germany`). Ohne diese Übersetzung
lieferte „Baustoffhandel" wieder Fürth statt Tecklenburg.

**„Hinterlegt" hieß bis 0.9.0 nur „da", nicht „lesbar".** Zugangsdaten
liegen verschlüsselt in der Datenbank, der Tresorschlüssel als Datei
unter `/app/data` (`backend/app/tresor.py`). Fehlt die Datei und die
Datenbank bleibt — gelöschter Datenordner, eine zurückgespielte Datenbank
aus einer anderen Installation —, dann steht in der Spalte weiter ein
Kryptotext. Die Einstellungen fragten `bool(row["suche_api_key"])` und
meldeten „hinterlegt"; `entschluesseln` gab `None`, der Dienst bekam ein
leeres Geheimnis, und Tavily antwortete mit 401. Marc suchte den Fehler
zwei Tage beim Schlüssel.

Seit 0.9.1 gibt es drei Zustände statt zwei (`tresor.lesbar`,
`tresor.verloren`): nichts da, da und lesbar, da und verloren. Jedes
`*_set` in `/api/settings` fragt jetzt, ob sich der Wert öffnen lässt,
und `zugangsdaten_verloren` nennt die verlorenen beim Namen. Oben in den
Einstellungen steht dann ein roter Hinweis. Die Suche geht ohne lesbaren
Schlüssel für Tavily und Brave gar nicht erst hinaus — ein leerer Bearer
sieht am anderen Ende aus wie ein falscher.

**Ein Schlüssel gehört zu seiner Adresse.** Bis 0.9.6 stand er in einer
Spalte, die den Dienst nicht kannte. Wer die Adresse von Brave auf Tavily
umstellte und das Schlüsselfeld leer ließ — es zeigt „hinterlegt" und
lädt genau dazu ein —, behielt den Brave-Schlüssel, und Rocket schickte
ihn als Bearer an Tavily. Antwort: 401, und im Bildschirm stand weiter
„hinterlegt". Marc am 10.9.2026: „Musste nur aufpassen wenn du wechselst,
weil der dann die Secret Keys durcheinander bringt." Er hatte es sich in
der Datenbank geradegerückt.

Seit 0.9.7 verwirft `routers/settings.py` das Geheimnis, wenn die Adresse
auf einen **anderen Rechner** zeigt und in derselben Anfrage kein neues
mitkommt (`ADRESSE_ZU_GEHEIMNIS`). Verglichen wird der Rechnername, nicht
die ganze Adresse: Ein Tippfehler im Pfad soll den Schlüssel nicht
wegwerfen. Die Regel gilt für alle vier Paare — Suche, Sprachmodell,
Sprachausgabe und Mail-Endpunkt.

**Und die Maske sagt jetzt, welcher Schlüssel dort liegt.** „Hinterlegt"
beantwortete die Frage nicht, die man wirklich hat. Seit 0.9.8 steht im
Feld `tvly-d…EL01`: Anfang und Ende, die Mitte verdeckt — dieselbe Form,
in der Tavily, OpenAI und Brave die Schlüssel in ihren eigenen
Übersichten zeigen, sodass man vergleichen kann. Der Anfang nennt Dienst
und Art, das Ende unterscheidet zwei Schlüssel desselben Kontos
(`tresor.kennung`).

Das gilt **nur für API-Schlüssel**, nicht für Passwörter: Ein Schlüssel
ist eine Kennung, die der Dienst selbst anzeigt; ein Postfachpasswort ist
keine. Und die Einstellungen darf jedes Mitglied lesen, nicht nur die
Verwaltung. Unter sechzehn Zeichen zeigt Rocket nur die Länge — von
„Anfang und Ende" wären sonst fast alle übrig.

Nebenbei nachgezogen: `tts_api_key_set` meldete noch Anwesenheit statt
Lesbarkeit; das war beim Tresorumbau in 0.9.1 übersehen worden.

**Wenn der Suchdienst den Schlüssel ablehnt**, sagt Rocket seit 0.9.0,
*welcher* Dienst das war und *welche Adresse* gefragt wurde
(`anreicherung._suchantwort_pruefen`). Vorher stand da „Der Endpunkt hat
mit 401 geantwortet" — und Rocket spricht mit **zwei** Endpunkten,
Sprachmodell und Suche. Wer den Suchschlüssel gerade eingetragen hatte,
suchte den Fehler zwangsläufig an der falschen Stelle (Marc, 10.9.2026).

Bei Tavily ist die Adresse im Satz wichtig: Der Dienst antwortet auf
**jede** Anfrage ohne gültigen Schlüssel mit 401 — auch auf eine im
falschen Format, auch auf ein GET (nachgemessen am 10.9.2026). Ein 401
allein sagt also nicht, ob Rocket überhaupt den Tavily-Weg genommen hat.
Die Adresse muss genau `https://api.tavily.com/search` lauten; ein 401
bei richtiger Adresse ist wirklich der Schlüssel.

### SearXNG auf der eigenen Box — was wirklich hilft

Am 9.9.2026 stand hier, SearXNG sei „meist untauglich". Das war zu früh
aufgegeben. Nachgemessen am 10.9.2026 auf derselben Box, Anbieter für
Anbieter:

| Anbieter | Antwort auf dieselbe Frage |
|---|---|
| DuckDuckGo | CAPTCHA |
| Brave | zu viele Anfragen |
| Startpage | CAPTCHA |
| Karmasearch | Zugriff verweigert |
| Mojeek | Zugriff verweigert |
| Qwant | Zugriff verweigert |
| Google | 0 Treffer, ohne Fehler |
| **Bing** | **10 Treffer** |
| Yandex | 10 Treffer |
| Seznam / Wiby | 5 / 12, beide Nischenindizes |

**Der entscheidende Fund:** Bing ist in der ausgelieferten
SearXNG-Konfiguration **abgeschaltet** — und der Parameter `engines`
weckt auch Abgeschaltete. Dieselbe Frage, dieselbe Instanz: mit der
Vorgabe der Instanz null Treffer, mit einer ausdrücklichen Liste zehn.
Seit 0.9.4 nennt Rocket die Anbieter deshalb selbst
(`anreicherung.SEARXNG_ANBIETER`): bing, duckduckgo, brave, startpage,
qwant, mojeek, wikipedia.

Gesperrte Anbieter kosten dabei nichts — sie sind bereits stummgeschaltet
und fallen sofort durch. Gemessen 0,2 bis 0,4 Sekunden, mit und ohne
Liste. Kennt eine Instanz einen Namen gar nicht, nimmt sie ihre eigene
Vorgabe; die Liste kann also nichts kaputt machen.

**Yandex bleibt draußen**, obwohl es antwortet. Ein deutscher Firmenname,
der zur Anreicherung nach Russland geht, ist keine Datensouveränität,
sondern nur eine andere Adresse.

**Was das taugt.** Gegen echte Firmen geprüft: Stadtwerke Lüneburg →
`swtenergie.de` ✓, Sennheiser Wedemark → `sennheiser.com` ✓, Rossmann
Burgwedel → `rossmann.de` ✓. „Stadt Munster Örtze" ✗ — dort hängt sich
Bing am Wort „Stadt" fest und liefert Oberzent. Mit `munster.de` oder
„Munster Lüneburger Heide" steht die richtige Seite auf Platz drei. Bing
ist also brauchbar, aber schwächer als Brave oder Tavily: bekannte Namen
findet es, bei kleinen Betrieben mit ungünstiger Formulierung nicht.

**Warum es überhaupt so weit kommt.** SearXNG fragt diese Dienste ohne
Schlüssel ab, wie ein Mensch mit Browser, und sie erkennen einen
Selbstbetreiber an der Adresse. Das trifft eine Instanz **mit der Zeit**,
nicht sofort — Marc schrieb am 10.9.2026: „searXNG hat bei mir ja
funktioniert, zB munster.de hatte ich damit angelegt und war begeistert.
Das geht nun auch nicht mehr." Genau das ist das Muster. Die Meldung sagt
das seit 0.9.4 auch so; bis dahin stand dort „Das gibt sich meist nach
einigen Stunden", und das stimmte nicht.

**Wenn auch Bing wegfällt**, bleiben zwei Wege: in der `settings.yml` der
SearXNG-Instanz einen Anbieter mit eigenem Schlüssel hinterlegen — dann
liegt der Schlüssel auf der Box und nur SearXNG spricht nach außen —,
oder unter Einstellungen Tavily oder Brave eintragen.

Mit Suchdienst findet die Anreicherung die Website, wenn nur der Name
bekannt ist, und holt die **LinkedIn-Treffer**: Unternehmensseite
(`linkedin.com/company/…`) und Personenprofile (`linkedin.com/in/…`) aus
Titel und Kurztext der Suchergebnisse. LinkedIn selbst wird nie
abgerufen — das ließe die Seite ohne Anmeldung nicht zu und die
Nutzungsbedingungen verbieten es. Bei SearXNG muss das JSON-Format
freigeschaltet sein (`search.formats: [html, json]` in der
`settings.yml`).

**Was das Modell darf.** Es ordnet Fundstellen den Feldern zu und nennt
zu jedem Wert die Quelle. Kontaktdaten (E-Mail, Telefon, LinkedIn,
Website, Straße, PLZ, Beschäftigtenzahl) müssen **wörtlich** in der
Quelle stehen, sonst fallen sie weg. Branche, Position und Beschreibung
dürfen gefolgert sein und sind so gekennzeichnet. Ein Modell, das vor
der Antwort nachdenkt, bekommt 6.000 Token — mit weniger kam auf der
Box nur das Nachdenken an.

**Was geschrieben wird.** Vorgabe ist *Leere Felder füllen*: Was am
Datensatz leer war und belegt ist, steht nach dem Lauf drin, mit
Protokolleintrag (`enrich`) und Verlaufseintrag. Abweichungen zu
vorhandenen Werten und die Beschreibung bleiben ein Vorschlag mit
Quelle, den ein Mensch am Datensatz übernimmt oder verwirft. Wer nichts
ohne Klick geschrieben haben will, stellt auf *Nichts* um; wer keinen
Lauf beim Anlegen will, schaltet *Beim Anlegen von selbst anreichern*
ab — der Knopf am Datensatz bleibt.

Jeder Lauf liegt in `anreicherungen`: gelesene Adressen mit Bytes,
gestellte Suchanfragen, Vorschlag, Übernommenes. Das ist der Nachweis,
was die Box verlassen hat.

**Region.** Seit 0.3.0 geht ein Länderkürzel mit (*Einstellungen → AI
und Programme → Region der Suche*, Vorgabe DE): Brave als `country`,
SearXNG als Sprache `de-DE`. Ohne Region liefert „Baustoffhandel“ Fürth,
wenn man Tecklenburg meint.

**SearXNG ist auf einer Heim-Box nicht verlässlich.** Es fragt Google,
Bing, DuckDuckGo und Startpage ohne Schlüssel — und die sperren einen
Selbstbetreiber mit fester IP nach wenigen Anfragen für Stunden bis
Tage. Gemessen am 6. September 2026 aus Rockets Namespace heraus: JSON
in 0,4 s, aber null Treffer, alle Maschinen `Suspended` oder `CAPTCHA`;
Bing lieferte für drei verschiedene Anfragen dieselben zehn Treffer, also
eine Abwehrseite. Rocket erkennt das seit 0.3.0 am Feld
`unresponsive_engines` und meldet *„Der Suchdienst ist gerade gesperrt“*
statt „nichts gefunden“ (`SucheGestoert` in `anreicherung.py`). Für ein
CRM, das je Anlegen fünf bis zehn Anfragen stellt, ist Brave der
tragfähige Weg; SearXNG bleibt als Wahl erhalten.

## Beschreiben statt tippen — Firma und Kontakt finden

Seit 0.3.0 beginnt der Anlegen-Dialog mit einer Wegwahl: **Beschreiben**
oder **Hineinwerfen** (Signatur, Visitenkarte, wie bisher). Beschreiben
nimmt einen Satz wie „Baustoffhandel im Tecklenburger Land, der
Geschäftsführer heißt vermutlich Sebastian“ und arbeitet in drei
Schritten (`backend/app/finden.py`, Endpunkte unter `/api/finden`):

1. **Kandidaten** (`POST /api/finden/kandidaten`). Die Beschreibung geht
   zweimal an den Suchdienst — pur und mit „Impressum“. Das Modell nennt
   aus den Treffern bis zu vier Firmen mit Website; Verzeichnisse
   (Gelbe Seiten, LinkedIn, Northdata …) sind keine Kandidaten, und eine
   Website, die in keinem Treffer steht, fällt weg. Dazu liest es aus der
   Beschreibung, was über die Person gesagt ist (Vorname, Nachname,
   Rolle). Ein Mensch wählt.
2. **Firma** (`POST /api/finden/firma`). Dieselbe Anreicherung wie am
   Datensatz — Impressum, Kontaktseite, LinkedIn-Treffer — nur ohne
   Datensatz. Name, Website und Domain kommen vom Kandidaten.
3. **Person** (`POST /api/finden/kontakt`). Team-, Impressums- und
   Kontaktseiten der Firma, gefiltert auf den Namen, plus Suchtreffer.
   Gefunden ist eine Person erst, wenn eine gelesene Quelle ihren
   **Nachnamen** nennt; der Vorname bleibt nur mit Beleg. „Vermutlich
   Sebastian“ wird nicht zu einem Kontakt, wenn ihn niemand nennt.
   Passt niemand, kommen unter `alternativen` die Personen zurück, die
   die Quellen bei dieser Firma nennen (Geschäftsführung, Inhaber,
   Ansprechpartner) — als Wahl in der Maske, nicht als Wert. Gemessen am
   6. September 2026 an „Baustoffhandel Tecklenburger Land, Geschäftsführer
   vermutlich Sebastian“: Firma vollständig belegt aus Impressum und
   LinkedIn-Treffer; die Geschäftsführer heißen laut Impressum anders,
   Sebastian Specht ist dort „verantwortlich für den Inhalt“.

4. **Personen bei einer Firma** (`POST /api/finden/personen`, seit 0.3.5).
   Ohne eine bestimmte Person zu meinen: alle, die Team-, Kontakt- und
   Impressumsseite und die Suchtreffer bei dieser Firma nennen, mit Rolle
   und wörtlich belegten Kontaktdaten. Ein Wunsch wie „Einkauf“ lenkt
   Suche und Reihenfolge. Die Maske zeigt sie als Auswahl: Im
   Firmen-Dialog läuft die Suche von selbst an, sobald eine Firma gewählt
   ist, und die gewählten Personen entstehen mit der Firma
   (`Anlegen, mit 2 Kontakten`); auf der Firmenseite unter Kontakte →
   *Finden* legt „als Kontakte anlegen“ sie direkt an, wer schon da ist,
   trägt „schon im Bestand“. Herkunft der so angelegten Kontakte:
   `Recherche`.

Die Antwort hat die Form eines Erfassungsvorschlags (`felder`) plus
`belege` je Feld (Quelle, wörtlich belegt) und `quellen` mit den
Suchanfragen, die den Suchdienst verlassen haben. Die Maske füllt nur
leere Felder und zeigt darunter je Quelle, welche Felder von ihr
stammen. **Gespeichert wird nichts** — Anlegen drückt ein Mensch über
die gewohnten Endpunkte; die Dublettenprüfung aus `erfassen.py` läuft
vorher.

Voraussetzungen: Sprachmodell (409 ohne) und für Schritt 1 ein
Suchdienst (409 ohne, 503 wenn gesperrt). Von der Firmenseite aus steht
die Firma fest; dann sucht der Dialog nur die Person und nimmt die
Beschreibung als Rolle.

Nachbau für die eigene Prüfung ohne Brave-Schlüssel: ein kleiner
HTTP-Server, der `/search` im SearXNG-Format, `/v1/chat/completions`
im OpenAI-Format und drei Seiten einer Firma liefert — beide Adressen
unter Einstellungen eintragen, dann läuft der Dialog gegen bekannte
Antworten. Die Tests in `backend/tests/test_finden.py` tun dasselbe
mit `httpx.MockTransport`.


### Während gelesen wird

Das Lesen der Firmenseiten dauert mit einem Modell auf der Box bis zu
einer Minute. Bis 0.9.8 stand in dieser Minute die volle Vorschlagsliste
da, jede Karte ausgegraut, und rechts in der gewählten ein kleines
„Liest …". Der Satz, was gerade passiert, hing lose darunter. Auf einem
Fenster von 800 px drückte das die eigentliche Maske — Name, Domain, Ort
— ganz aus dem Bild, und eine Minute ohne sichtbare Bewegung sieht aus
wie ein Fehler.

Seit 0.9.9 bleibt genau die gewählte Firma stehen, mit einer laufenden
Leiste und dem Satz daneben. Die anderen Vorschläge sind in diesem Moment
Lärm: Anklicken kann man sie ohnehin nicht. Die Leiste ist gold — dieselbe
Auszeichnung, die das Designsystem der laufenden Aufnahme gibt; Rot bleibt
dem Fehler. Bei `prefers-reduced-motion` steht sie still und zeigt nur an,
dass etwas läuft.

Die Begründung des Modells steht **unter** der Karte statt darin: In der
Karte wuchs sie auf zwei Zeilen und drückte Name und Knopf auseinander.
Bei nur einem Vorschlag bleibt sie ganz weg — es gibt nichts abzuwägen,
und „welche meinen Sie?" ist bei einem Vorschlag keine Frage.

## Erkenntnisse — aus Gesprächsnotizen lernen

Seit 0.3.6 gibt es die Seite *Erkenntnisse*: Was Kunden in Gesprächen
über die Produkte sagen, gebündelt zu Themen, je Thema mit dem, was das
fürs Produkt heißt. Zwei Schritte (`backend/app/erkenntnisse.py`):

1. **Aussagen ziehen.** Verlaufseinträge der Arten Notiz, Anruf, E-Mail,
   Termin mit mindestens 40 Zeichen Text werden in Stapeln von sechs ans
   Modell gegeben. Je Aussage: Art (Lob, Kritik, Wunsch, Einwand, Frage),
   Produkt, ein neutraler Satz und das **Zitat aus der Notiz** — ohne
   Zitat, das in der Notiz steht, fällt die Aussage weg. Jede Notiz wird
   genau einmal gelesen (`auswertungen`); die Aussagen bleiben
   (`aussagen`).
2. **Themen bilden.** Alle Aussagen des Zeitraums (höchstens 300) gehen
   gebündelt ans Modell; es nennt Themen mit Zuordnung, Bedeutung und
   Vorschlag. Ein Thema ohne zugeordnete Aussage fällt weg, jede Aussage
   zählt nur einmal. Der Lauf liegt in `themenlaeufe` mit Fortschritt
   (`gelesen`/`gesamt`/`schritt`), damit die Seite ihn zeigen kann.

Endpunkte: `GET /api/erkenntnisse?tage=90` (letzter Lauf des Zeitraums,
Aussagen, Zähler je Art, noch nicht gelesene Notizen),
`POST /api/erkenntnisse/auswerten {tage}` startet den Lauf im
Hintergrund (202; 409 ohne Modell oder wenn einer läuft). Auf der Box
dauert ein Lauf mit vierzig Notizen und dem Denkmodell einige Minuten;
die Seite fragt alle drei Sekunden nach. Jedes Thema zeigt die
Gespräche dahinter mit Zitat, Firma und Datum — niemand muss dem Modell
glauben. Die drei Tabellen stehen im Abzug.

## Kopfleiste — suchen und anlegen, von überall

Seit 0.9.0 steht über allem eine 56 px hohe Leiste
(`components/kopfleiste.tsx`) mit genau drei Dingen: der Marke, dem
Suchfeld und „Neu ▾“. Vorher saß die Suche zwischen Kopfecke und
Navigation in der Seitenspalte, und Anlegen gab es nur je Seite — wer auf
dem Lead-Brett stand und einen Kontakt brauchte, musste erst wechseln.

**Warum nur diese drei.** HubSpots Leiste ist voll, weil dort acht
Produkte, Telefonie und Hinweise unterzubringen sind. Rocket ist ein
Produkt für ein kleines Team; wer den Behälter kopiert, ohne den Inhalt
zu haben, bekommt eine leere Leiste. Konto und Datenweg-Nachweis bleiben
deshalb unten in der Spalte: Der Nachweis ist kein Bedienelement, sondern
die Aussage des Produkts — oben wäre er ein Symbol neben anderen.

**Der Markenblock ist genau so breit wie die Navigationsspalte** minus
Polster und Abstand. Dadurch beginnt das Suchfeld exakt an der Kante der
Inhaltsspalte (gemessen: beide bei x = 240), und die senkrechte
Trennlinie läuft von der Leiste bis nach unten durch. Eingeklappt (64 px)
geht das nicht auf — dort bekommt der Block seine natürliche Breite.

**„Neu“ öffnet keinen Dialog in der Hülle**, sondern zeigt auf die Liste,
in der der Datensatz danach steht, mit `?neu=1` (`frontend/lib/neu.ts`).
Grund: Die Anlegen-Dialoge brauchen Daten, die auf ihrer Seite ohnehin
geladen sind — Pipelines und Stufen beim Lead, Kategorien beim Ticket. In
die Hülle gezogen, stellten sie diese Abfragen auf **jeder** Seite, für
ein Menü, das man selten öffnet. `useNeuGewuenscht()` liest den Parameter
einmal und nimmt ihn per `history.replaceState` wieder aus der Adresse,
sonst öffnete ein Neuladen den Dialog ein zweites Mal. Aufgaben haben
keinen Dialog, sondern eine Zeile über der Liste — dort springt „Neu“ ins
Feld.

**Die Suche öffnet sich unter dem Feld, nicht in der Bildmitte.** Bis
0.9.2 war das Feld in der Leiste ein *Knopf*, der ein Fenster über allem
öffnete — man klickte auf ein Feld, es verschwand, und ein zweites,
gleich aussehendes erschien in der Mitte des Bildes. Seit 0.9.3 ist das
Feld in der Leiste das echte Feld; die Treffer hängen als Klappfeld
daran, in seiner Breite (gemessen: beide bei x = 240, Breite 520).
⌘K / Strg+K führt zum Feld, statt ein zweites zu öffnen. Escape schließt
das Klappfeld, der getippte Text bleibt stehen — wer zurückkommt, tippt
weiter.

Unter 40 rem hängt das Klappfeld nicht mehr am Eingabefeld, sondern an
der Leiste (`position: fixed`, links und rechts das Polster der Leiste).
Am Feld blieben bei 375 px nur 320 px, die genau bis an den rechten
Bildrand stießen. **Die Medienabfrage muss dabei hinter der Grundregel
stehen** — sie hat dieselbe Spezifität, und die spätere Regel gewinnt.
Beim ersten Versuch stand sie davor und wirkte nicht.

**Der Knopf trägt HubSpots Form:** ein Rechteck mit 4 px Radius und
knappem Polster, 40 px hoch wie das Suchfeld daneben. Der weiche
8-px-Knopf der Formulare mit 24 px Polster las sich neben dem Feld wie
ein Fremdkörper. Er heißt „Erstellen" und zeigt kein Plus — auf dem Handy
weicht das Wort und das Zeichen bleibt.

**Auf dem Handy** weichen außerdem Produktwort und Klappschalter; die
Wortmarke schrumpft von 28 auf 22 px Höhe. Bei 375 px stand sonst
„Suchen oder fr…“ im Feld.

## Anlegen-Dialoge — Kopf, Mitte, Fuß

Bis 0.8.4 war ein Anlegen-Dialog eine lange Rolle: Titel, Wegwahl,
Beschreiben-Feld, Fundbericht und alle Felder scrollten gemeinsam, und
„Anlegen“ wanderte mit nach unten aus dem Bild. Bei der Firma reichte ein
Fenster von 800 px nicht mehr — man musste erst suchen, wo der Knopf
geblieben war.

Seit 0.9.0 hat jeder der vier Dialoge (Kontakt, Firma, Lead, Ticket)
einen festen Rahmen: `.dialog-kopf` mit Titel und Schließkreuz,
`.dialog-koerper` als einziger rollender Teil, `.dialog-fuss` mit den
Knöpfen. Das `<form>` umschließt Mitte **und** Fuß — sonst löst der Knopf
im Fuß kein `submit` aus. Höhe gedeckelt auf `min(100dvh − 32px, 46rem)`:
Ein Dialog über die ganze Bildschirmhöhe liest sich wie eine Seite und
nicht mehr wie eine Frage.

Dazu drei Kleinigkeiten, die den Eindruck ausmachten:

- **Kurze Felder stehen paarweise** (`.feld-paar`), unter 30 rem
  untereinander. Fünf volle Zeilen mit je 24 px Luft waren eine halbe
  Bildschirmhöhe für vier Wörter.
- **Im Dialog stehen Felder enger** — `raum-4` statt `raum-6`.
- **Es gibt genau einen schwarzen Knopf**, und das ist „Anlegen“.
  „Suchen“, „Auslesen“ und „Personen suchen“ füllen nur die Maske; als
  zweiter primärer Knopf sahen sie aus wie der Abschluss und zogen den
  Blick vom eigentlichen Knopf weg. „Bild wählen“ ist ein Umweg und
  entsprechend still.


**Bis 0.10.0 hatte keiner dieser Rahmen einen Innenabstand.** Kopf, Mitte
und Fuß polsterten mit `var(--am-raum-5)` — die Raumskala springt aber von
4 auf 6. Eine unbekannte CSS-Variable ist kein Fehler, sie ist einfach
nichts: Titel, Felder und Knöpfe klebten am Rand, und der Browser meldete
es nirgends. Seit 0.10.0 prüft `lib/__tests__/token.test.ts`, dass jede
`var(--am-…)` in `app`, `components` und `lib` definiert ist. Er fand beim
ersten Lauf drei weitere: `--am-handlung` (gemeint `--am-handlung-ruhend`;
die Zählpille am Filterknopf trug weiße Schrift ohne Hintergrund),
`--am-schatten-1` (Klappmenüs und Suchtreffer schwebten ohne Schatten —
jetzt ein Token, hell und dunkel) und `--am-radius-2`.

## Navigation — kurze Leiste, „Mehr“, Favoriten, Einklappen

Seit 0.5.3 macht es die Leiste wie HubSpot (`frontend/lib/navigation.ts`
trägt die Daten, `components/huelle.tsx` die Symbole): Sie zeigt nur, was
die Person sich gemerkt hat — in der Reihenfolge der Sterne. Solange
niemand einen Stern gesetzt hat, stehen sechs Vorgaben da (Start, Leads,
Aufgaben, Firmen, Kontakte, Eingang, `LEISTE_STANDARD`); der erste Stern
ersetzt sie ganz. Darunter **„Mehr“**: ein Feld rechts neben der Leiste
mit allen vierzehn Bereichen in den vier Gruppen **Verkauf** (Start,
Leads, Angebote, Prognose, Aufgaben), **Bestand** (Firmen, Kontakte,
Listen), **Post** (Eingang, Tickets, Kampagnen), **Wissen** (Fragen,
Erkenntnisse, Einstellungen) nebeneinander, je Eintrag der Stern. Ein
Feld statt HubSpots zwei Stufen: Bei vierzehn Zielen ist alles auf einen
Blick da. Escape, Klick außerhalb oder ein Seitenwechsel schließen es.
Von 0.3.8 bis 0.5.2 standen alle Gruppen mit Überschrift in der Leiste —
mit Favoriten darüber wurden das neunzehn Zeilen.

**Favoriten** hängen an der Person, nicht am Browser: Stern am Eintrag
(in der Leiste bei Hover oder Tastaturfokus, in „Mehr“ immer sichtbar),
gemerkte Einträge bilden die Leiste. Gespeichert in `users.einstellungen` (jsonb, Migration 0024)
über `PATCH /api/mitglieder/wer/einstellungen {"favoriten": [...]}`; `null`
löscht den Schlüssel, unbekannte Schlüssel werden abgewiesen. `user_id` ist
die angemeldete Person — Marc hat seine eigenen. Die Oberfläche
schaltet sofort um und nimmt sich bei Fehler zurück (`frontend/lib/wer.ts`).
Kein Protokolleintrag: eine Vorliebe ist kein Geschäftsdatum. In der
Sicherung reist `einstellungen` im `nutzer`-Block mit und wird beim
Wiederanlauf nur gefüllt, wo es leer ist.

**Die Kopfecke gibt es seit 0.9.0 nicht mehr** — Marke, Klappschalter und
Suche sind in die Kopfleiste gezogen, und die Spalte beginnt mit
Navigation. Ihre Breite von 240 px (`--huelle-nav-breite`) bleibt: Wappen,
Wortmarke, „Rocket“ und der Klappschalter brauchen zusammen 227 px, und
bei 220 lief die Beschriftung elf Pixel aus ihrem Kasten (0.5.7).

**Einklappen** auf Symbole: Knopf in der Kopfleiste oder ⌘B / Strg+B. Zustand
je Browser im Cookie `rocket-navigation`, vor dem ersten Anstrich per
Inline-Script als `html[data-navigation="eingeklappt"]` gesetzt
(`components/navigation.tsx`, wie die Darstellung). Eingeklappt zeigt jeder
Eintrag seinen Namen als Tooltip; „Mehr“ öffnet auch dann das volle Feld.

**Der Fuß** trug bis 0.5.5 drei Dinge nebeneinander, die nichts
miteinander zu tun haben: eine Personenkarte mit Rahmen (schwerer als
jeder Eintrag darüber, mit der Unterzeile „angemeldet“ — was man ohnehin
sieht), den Dreifach-Schalter für die Darstellung und den Satz „läuft auf
dieser Box“ in 10-px-Monoschrift. Seit 0.5.6 sind es zwei Zeilen mit
Aussage (`components/konto.tsx`):

*Die Kontozeile* ist ruhig — Kreis, Name, kein Kasten — und öffnet ein
Menü nach oben mit **Darstellung** und, bei eigener Anmeldung, **Zugang**
(Passwort und zweiter Faktor, Abmelden). Das Menü schließt bei Escape,
Klick außerhalb und Seitenwechsel und gibt den Fokus zurück. Die
Sitzplatz-Auswahl ist seit 26.9.2 weg.

*Die Nachweiszeile* nennt den **gemessenen** Stand und führt auf
*Einstellungen › Daten › Wohin Daten gehen*. `lib/datenwege.ts` prüft
jeden eingetragenen Endpunkt (Sprachmodell, Sprachausgabe, Suchdienst,
SMTP, Postausgang, Brevo). Als **auf dieser Box** gelten Kubernetes-
Dienstname, `localhost`, privates Netz — und die **eigene Olares-Zone**,
abgeleitet aus der Adresse der öffentlichen Links
(`fdfedc011.kaivostudio.olares.de` → `kaivostudio.olares.de`). Alles
andere wird gezählt und im Tooltip beim Namen genannt. Also „Alles auf
dieser Box“ oder „2 Ziele außerhalb“; ohne geladene Einstellungen steht
dort **nichts**.

Die Zonen-Regel ist gemessen, nicht vermutet (8.9.2026, aus dem
Backend-Pod): `llm.kaivostudio.olares.de` löst auf `192.168.1.17` auf —
die Box selbst. Olares führt seine Zone intern auf den eigenen Knoten,
ein Aufruf dorthin verlässt das Haus nicht. Ohne die Regel meldete die
Zeile „2 Ziele außerhalb“, wo nur eines hinausgeht (0.5.8); ein falscher
Alarm zerstört das Vertrauen in den Nachweis so zuverlässig wie eine
falsche Beruhigung.

**Warum die Zonen-Adresse und nicht der Dienstname?** Weil ein Dienst im
eigenen Namensraum von Rocket aus nicht erreichbar ist. Gemessen: der
Aufruf von `litellm-svc.litellm-kaivostudio.svc.cluster.local` aus
`rocket-kaivostudio` läuft in eine Zeitüberschreitung. Im LiteLLM-
Namensraum steht nur `app-np`; Olares riegelt Namensräume gegeneinander
ab (Constraint 4). Nur als **shared** installierte Apps tragen die
Regeln, die andere hereinlassen — Speaches (`speachesv3-shared`) hat
`shared-np`, `shared-entrance-np` und `app-gateway-shared-ingress-np`
und ist deshalb direkt ansprechbar. Für eine App im eigenen Namensraum
ist die Zonen-Adresse also nicht Bequemlichkeit, sondern der einzige
Weg.

Der alte Satz musste weg, weil `docs/DESIGN.md §5` es verlangt: Der
Nachweis trägt „gemessene Werte — oder gar nicht“, denn „eine Zusage ohne
Beleg ist schlechter als keine“. Er war zudem falsch geworden: Mit
eingetragenem Brave-Suchdienst verlässt sehr wohl etwas die Box, und die
Einstellungen sagten das daneben schon ehrlich.

**Mobil** (unter 1024 px) bleibt die Leiste unten: die ersten Favoriten,
aufgefüllt aus Start, Leads, Firmen, Kontakte bis vier, dazu „Mehr“ mit
allen übrigen Bereichen samt Einstellungen. Der Fuß ist dort ausgeblendet.

## Assistent — Aufträge in Worten, Handlungen mit Karte

Seit 0.4.0 sitzt unten rechts ein Knopf mit dem Schild (`components/assistent.tsx`).
Ein Auftrag wie „Leg für Brinkmann eine Aufgabe an: Angebot nachfassen,
Freitag“ geht an `POST /api/assistent` (`backend/app/assistent.py`). Das
Modell bekommt Rockets Funktionen als Werkzeuge im OpenAI-Format
(`llm.chat_werkzeuge`; auf der Box geprüft: `chat` über LiteLLM liefert
saubere Aufrufe samt aufgelöstem Datum, rund zehn Sekunden je Schritt),
plant, und Rocket führt aus — höchstens fünf Schritte je Auftrag.

**Lesen sofort, Schreiben mit Karte.** `suchen`, `aufgaben_offen` und
`seite_oeffnen` laufen direkt (Öffnen navigiert die Oberfläche). Die
schreibenden Werkzeuge — `aufgabe_anlegen`, `notiz_anlegen`,
`kontakt_anlegen`, `lead_verschieben` — schreiben nichts: Sie lösen Namen
im Bestand auf und geben eine **Karte** zurück, in der die Anfrage fertig
steht (`anfrage.methode/pfad/koerper`). Die Oberfläche führt sie erst auf
„Ausführen“ aus, mit den Rechten der Person, über die normalen Endpunkte.
Das Modell schreibt nie selbst, und es erfindet keine Kennungen: Bei
mehreren Treffern bekommt es die Kandidaten als `nachfrage` und fragt
zurück; bei keinem Treffer sagt es das.

Verlauf: die letzten zehn Nachrichten gehen mit, je Sitzung im Browser,
nichts wird gespeichert. Ohne Sprachmodell antwortet der Endpunkt 409.
Tests in `backend/tests/test_assistent.py` fahren die Schleife mit einem
Skript statt Modell: Karte statt Schreibzugriff, Nachfrage bei
Mehrdeutigkeit, Stufenwechsel kennt die Pipeline.

Nächste Stufen, bewusst noch nicht gebaut: Ketten („für jede Firma der
Liste …“) und Versand (Ticket-Antwort, Kampagne) — Versand nie ohne
ausdrückliche Bestätigung.

## Gespräch vorbereiten — der Bestand als Podcast

Seit 0.5.0 gibt es auf jeder Firmen- und Lead-Seite den Block *Gespräch
vorbereiten* (`components/podcast.tsx`, `backend/app/podcast.py`). Ein
Klick auf „Podcast erzeugen“ macht aus allem, was zur Firma im Bestand
steht, ein Gespräch zweier Stimmen von fünf bis acht Minuten: Eine
Moderatorin fragt, ein Kollege aus dem Vertrieb antwortet — wer sie sind,
was zuletzt geschah, was offen ist, was Kunden gesagt haben, und drei
Fragen für den Termin. Zum Anhören auf dem Weg, auch am Handy, nach der
Olares-Anmeldung. Nichts verlässt die Box.

**Drei Schritte, alle auf der Box.** Der Kontext ist dieselbe
Zusammenstellung wie für die AI-Zusammenfassung (`routers/ki._kontext_firma`),
dazu offene Tickets, Aussagen aus den Erkenntnissen (mit Zitat), offene
Aufgaben und Angebote. Das Sprachmodell schreibt daraus ein Skript in
acht bis vierzehn Segmenten mit Sprecherwechsel — als JSON, mit dem
Auftrag, nichts zu erfinden und Fehlendes als Frage zu benennen. Dann
spricht die Sprachausgabe jedes Segment mit der Stimme seines Sprechers,
und Rocket fügt die MP3-Teile zu einer Datei zusammen (ID3-Kopf und
Xing-Rahmen nur einmal). Die Folge liegt unter
`/app/data/podcasts/<org>/<id>.mp3` mit Rechten 0600, die Zeile in
`podcasts` (0025) geht in der Sicherung mit — der Pfad steht in der
Zeile und wird nie neu abgeleitet, weil die Organisation nach einer
Wiederherstellung eine neue Kennung trägt.

**Die Sprachausgabe** steht unter *Einstellungen › AI und Programme ›
Sprachausgabe*: ein OpenAI-kompatibler Dienst (`POST /v1/audio/speech`),
auf der Box **Speaches**. Die Adresse ist je Installation anders —
`kubectl get svc -A | grep speaches` nennt sie, auf Kais Box
`http://speaches.speachesv3-shared.svc.cluster.local:8000`. Deutsche
Stimmen sind Piper-Modelle; Vorgabe ist Thorsten (high) für den Kollegen
und Kerstin (low) für die Moderatorin. Speaches bringt sie nicht mit:
„Stimme einrichten“ ruft `POST /v1/models/{id}` — der Dienst lädt das
Modell einmalig von Hugging Face, ohne Kundendaten, das dauert je nach
Leitung einige Minuten, und die Seite fragt alle drei Sekunden nach.
„Kollegen hören“ und „Moderatorin hören“ (`POST /api/podcasts/probe`)
beweisen die Einrichtung, bevor jemand eine Folge wartet. Ehrlich gesagt:
Thorsten klingt gut, die weiblichen Piper-Stimmen hörbar einfacher.

Die Stimme (`voice`) je Modell muss man nicht eintragen: Rocket fragt
`GET /v1/audio/speech/voices`, sonst probiert es die Kennung aus dem
Modellnamen und merkt sich, was der Dienst annahm (`STIMMEN_ERMITTELT`).
Ein eingetragener Wert (`tts_stimme`, `tts_stimme_2`) geht vor.

**Automatik.** Mit dem Häkchen „Gespräche mit Termin automatisch
vorbereiten“ sieht `_podcastschleife` in `main.py` stündlich nach:
Für jede offene Aufgabe der Art *Termin* mit Firma oder Lead und Frist in
den nächsten 24 Stunden entsteht eine Folge — genau eine je Termin
(eindeutiger Teilindex auf `task_id`), im Namen dessen, dem der Termin
zugewiesen ist. Die Startseite zeigt sie unter *Heute vorbereitet*.

Endpunkte: `GET /api/podcasts/status`, `POST /api/podcasts {entity, entity_id, anlass?}`
(202, läuft im Hintergrund; 409 ohne Modell oder Sprachausgabe oder solange
eine Folge entsteht), `GET /api/podcasts?entity&entity_id`, `GET /api/podcasts/heute`,
`GET /api/podcasts/{id}`, `GET /api/podcasts/{id}/audio` (audio/mpeg, mit
Range — der Player kann springen), `DELETE /api/podcasts/{id}` (nimmt die
Datei mit), `GET /api/podcasts/stimmen`, `POST /api/podcasts/stimmen/einrichten`,
`POST /api/podcasts/probe`. Die Dauer ist eine Schätzung aus der Wortzahl
(„ca. 6 Min“), keine Messung.

Tests in `backend/tests/test_podcast.py` fahren den Lauf mit Skript statt
Modell und einem Speaches-Nachbau (`httpx.MockTransport`): Bestand im
Prompt, Sprecherwechsel, je Stimme ihr Modell, Verkettung ohne doppelte
Köpfe, 0600, Range, Löschen, Automatik einmal je Termin, fremde
Organisation sieht nichts.


### Modell und Stimme sind zwei Dinge

Bis 0.9.5 hatte jeder Sprecher **ein** Feld, beschriftet „Stimme".
Gespeichert wurde darin aber das *Modell*. Das ging auf, solange am
anderen Ende Speaches mit Piper-Modellen hängt: Dort ist die Stimme das
Modell, und `_stimme_ermitteln` errät den Rest durch Probieren. Bei jedem
anderen OpenAI-kompatiblen Dienst sind es zwei Angaben — Marc meldete am
10.9.2026 von seiner Box mit Omnivoice: Modell `tts-voxtral`, Stimme
`clone:new` —, und für das zweite gab es kein Feld. Der Server schickte
die Stimme längst mit (`podcast.TTSConfig.fuer`), nur konnte sie niemand
eintragen.

Seit 0.9.6 hat jeder Sprecher beides, in einem eigenen Feldsatz. Die
Stimme ist **optional**: Bleibt sie leer, errät Rocket sie wie bisher —
der Piper-Weg ändert sich nicht.

Das Modellfeld ist ein **Textfeld mit Vorschlagsliste**, keine Auswahl.
Eine Auswahl kann nur anbieten, was der Dienst meldet, und die Liste ist
auf deutsche Piper-Modelle gefiltert; an einem Dienst ohne solche war sie
leer, und dann ließ sich nichts eintragen. Mit `<datalist>` bleiben die
Vorschläge, wo es welche gibt, und tippen geht immer.

## Anmeldung — warum Rocket das doch selbst macht

Die Hausregel lautet „keine eigene Authentifizierung, das macht Olares".
Sie gilt weiter für den Normalfall, und der Bruch hier hat einen
gemessenen Grund.

**Olares kann es für ein Team nicht.** Eine Olares-App wird je Nutzer
installiert — auf der Box liegt Rocket im Namensraum `rocket-kaivostudio`
mit `owner: kaivostudio`. Ein zweites Olares-Konto bekäme ein eigenes,
leeres Rocket mit eigener Datenbank; Marc sähe Kais Bestand nicht. Der
einzige geteilte Modus ist die *shared app*, und die hat laut Olares'
Plattformdokumentation ausdrücklich **keinen Entrance und keine URL** —
sie ist für Hintergrunddienste wie Speaches gedacht. Für mehrere Menschen
in **einem** Bestand gibt es also keinen Olares-Weg.

Die Sitzplätze waren die bisherige Antwort auf genau diese Lücke. Sie
schreiben Arbeit einer Person zu, sind aber **keine Anmeldung**: Wer den
geteilten Zugang hat, kann jeden Platz einnehmen.

### Stand: offen seit dem 8. September 2026

Der Entrance `rocket` steht auf `public`, der Modus auf `eigen`. Von außen
ohne jede Box-Sitzung gemessen: Startseite 200, Anmeldemaske 200, und mit
gefälschtem `X-Bfl-User` überall 401 — Firmen, Einstellungen, Mitglieder,
Sicherung anlegen, Sicherung zurückspielen, Einstellungen ändern, Person
anlegen. Falscher Name und falsches Passwort antworten wortgleich. Elf
Fehlversuche ergeben 429 mit `Retry-After: 900`.

### Die Reihenfolge ist die Sicherheit

**Erst `ANMELDUNG_MODUS=eigen`, dann den Entrance öffnen. Nie umgekehrt.**

Ein offener Entrance bei `olares` ist die vollständige Preisgabe: Der Kopf
`X-Bfl-User` kommt ungeprüft durch den Next-Proxy bis ins Backend, und ein
`curl -H 'X-Bfl-User: kaivostudio'` aus dem Internet ist der Eigentümer —
mit Lesezugriff auf den ganzen Bestand und offener Sicherung daneben.

Der `authLevel` lässt sich **auch in den Olares-Einstellungen** umstellen
(Settings › Applications › rocket › Authentication level), nicht nur über
das Manifest. Das ist ein Klick und wirkt sofort. Wer ihn drückt, bevor
der Modus steht, öffnet genau dieses Fenster. Deshalb steht `eigen` seit
0.6.2 im Deployment, während das Manifest den Entrance noch auf `internal`
lässt: Das kostet einen zusätzlichen Anmeldeschritt und schließt die Lücke.

Prüfen lässt sich der wirksame Stand nur an der Box, nicht am Bildschirm:

```bash
kubectl get applications.app.bytetrade.io rocket-kaivostudio-rocket \
  -o jsonpath='{range .spec.entrances[*]}{.name}{"  "}{.authLevel}{"\n"}{end}'
```

### Zwei Modi, und was der Unterschied bedeutet

`ANMELDUNG_MODUS` steht als Literal im Deployment (nicht in `values.yaml`
— ein Upgrade spielt die Werte der Installation zurück, eine Umstellung
käme dort nie an):

| Modus | Wer prüft | `X-Bfl-User` | Entrance |
|---|---|---|---|
| `olares` (heute) | Envoy-Sidecar mit Authelia | gilt, legt beim ersten Aufruf Nutzer und Organisation an | `internal` |
| `eigen` | Rockets Sitzung | **gilt nicht** und legt **nichts** an | `public` möglich |

Der zweite Modus ist die Voraussetzung dafür, den Eingang zu öffnen. Ohne
ihn genügte ein `curl -H 'X-Bfl-User: kaivostudio'`, um Eigentümer zu
sein und den ganzen Bestand zu lesen.

### Die Erstinstallation: ein Code aus dem Datenordner (seit 26.10.1)

Aus dem Markt installiert steht `ANMELDUNG_MODUS=eigen` von Anfang an. Eine
frische Datenbank hat aber keinen Nutzer, kein Passwort und keine
Einladung. Am 8. September führte das bei einem zweiten Nutzer zu 401 auf
alles, eine Sackgasse.

**Von 0.6.3 bis 26.9.7 lautete die Antwort: Solange niemand ein Passwort
hat, zählt der Olares-Kopf weiter.** Begründet war das damit, dass eine
frische Installation hinter `authLevel: internal` stehe. Seit 0.6.9 ist der
Entrance aber von Anfang an `public` — die Begründung war damit weg, die
Ausnahme blieb. Bis zum ersten Passwort genügte also
`curl -H 'X-Bfl-User: kaivostudio'`, und der Name steht in der Adresse der
Box. Kai fand das am 1.10.2026 über den Hinweis in den Einstellungen.

**Seit 26.10.1 gilt der Kopf im Modus `eigen` nie.** An seine Stelle tritt
dieselbe Hürde wie beim vergessenen Passwort — der Zugang zur Box:

- Solange niemand ein Passwort hat, legt Rocket beim Start (und beim
  Öffnen der Anmeldeseite) **Data › rocket › rocket-einrichten.txt** an,
  0600, mit einem Code. Das Pod-Log nennt den Ort.
- Die Anmeldeseite zeigt dann „Rocket einrichten“: Code, Name, Passwort
  (`POST /api/anmeldung/einrichten`, `app/einrichtung.py`).
- **Gibt es schon eine Eigentümerin ohne Passwort** — eine Box, die vor
  26.10.1 über den Kopf eingerichtet wurde —, nennt die Datei ihren Zugang,
  und genau sie bekommt das Passwort; der Bestand bleibt. Sonst entsteht
  der Zugang mit dem eingetragenen Namen samt Organisation, und ein Abzug
  neben den Daten wird wie bisher zurückgespielt.
- Der Code gilt, bis eingelöst ist (eine Installation wird oft erst Tage
  später eingerichtet); ein Neustart behält ihn. Raten bremst dieselbe
  Bremse wie die Anmeldung. Danach ist die Datei weg, und
  `POST /api/anmeldung/einrichten` antwortet mit 409.

**Nachgezogen in 26.10.2:** Auf Kais Box kam nur „Der Code stimmt nicht“
— zuerst stand eine eingefügte Adresse im Feld (iOS füllte ein Feld mit
`autocomplete="one-time-code"` selbst), danach passte der Code nicht.
Seitdem gleicht Rocket O→0 und I/L→1 an (im Code kommen sie nie vor),
die Seite prüft die Form vor dem Senden und zählt so keinen Versuch, die
Meldung nennt Form und Datei, und das Pod-Log schreibt bei jedem
Fehlversuch, ob die Datei da war und wie viele Zeichen ankamen — nie den
Code.

**Für eine Box, die vor 26.10.1 ohne Passwort lief:** Nach dem Update kommt
niemand mehr über die Olares-Sitzung herein. Die Anmeldeseite zeigt
„Rocket einrichten“; der Code liegt in der Dateien-App, der Zugang steht
in der Datei.

### Wie ein Zugang entsteht

Es gibt **keine Registrierung**. Der Eigentümer legt unter *Einstellungen ›
Firma und Team* eine Person an und drückt in ihrer Zeile auf das
Schlüsselsymbol. Zurück kommt ein Link zum Weitergeben — keine Mail: SMTP
ist auf einer frischen Box nicht eingerichtet, und ein Zugang, der am
Mailversand hängt, wäre genau dann nicht da, wenn man ihn braucht.

Der Link gilt sieben Tage und **genau einmal**. Ein neuer Link entwertet
den alten. Wer ihn öffnet, setzt sein Passwort (mindestens zwölf Zeichen)
und ist danach angemeldet.

**Der Eigentümer macht das für sich selbst genauso** — und zwar *bevor*
der Eingang öffnet. Das Schlüsselsymbol steht auch in seiner eigenen
Zeile. Wer den Schalter auf `eigen` legt, ohne vorher ein Passwort gesetzt
zu haben, sperrt sich aus: Der Olares-Kopf zählt dann nicht mehr, und es
gibt kein Konto, das durch die Maske käme. Zurück hilft dann nur, den
Modus im Deployment vorübergehend wieder auf `olares` zu setzen.

### Die Einladungsseite nennt Kennung und Box

Am 8. September schickte ein zweiter Nutzer von **seiner** Box eine
Einladung. Auf dem Handy stand groß „Willkommen, Kai", darunter klein die
Kennung `marc-bayer`, und die Adresszeile war abgeschnitten. Drei Dinge
gingen dabei schief, und alle drei lagen an der Seite, nicht am Menschen:

- **Der Anzeigename führte.** Er ist nur ein Etikett und kann auf jemand
  anderen zeigen. Entscheidend ist die Kennung; sie steht jetzt oben, in
  der Schrift, in der sich `l` und `1` unterscheiden.
- **Die Seite sagte nicht, zu welchem Rocket der Link gehört.** Jetzt nennt
  sie den Ursprung im Text, nicht nur in der Adresszeile.
- **Eine Einladung auf ein Konto mit Passwort sah aus wie eine Erstanlage.**
  Sie ist aber ein **Zurücksetzen**: Der bisherige Inhaber ist danach
  ausgesperrt. Für einen Eigentümer ist das der Rettungsweg, für einen
  falsch zugestellten Link ein Unfall. Die Seite heißt in diesem Fall
  „Zugang zurücksetzen", der Knopf „Passwort ersetzen", und die
  Einstellungsseite warnt schon beim Erzeugen.

Der Endpunkt `GET /api/einladung/{token}` liefert dafür `uebernahme`.
Verraten wird dadurch nichts, was der Linkinhaber nicht ohnehin erführe.

### Was gespeichert wird — und was nicht

- Vom Passwort bleibt ein **argon2id-Hash**, nie das Passwort.
- Vom Sitzungstoken bleibt ein **SHA-256**. Wer die Datenbank liest, kann
  sich damit nicht anmelden.
- Die Sitzung lebt auf dem Server. Ein selbstsigniertes Token im Keks wäre
  nach „Abmelden" weiter gültig, bis es abläuft; eine Zeile in `sitzungen`
  lässt sich wirklich beenden.
- Der Keks `rocket_sitzung` trägt `HttpOnly` (kein JavaScript sieht ihn),
  `SameSite=Lax` und `Secure`, sobald die Verbindung über TLS kam.
- Absolut 30 Tage, im Leerlauf 7. Eine Schleife räumt Abgelaufenes weg.

### Was die Anmeldemaske nicht verrät

Falsches Passwort und unbekannter Name antworten **wortgleich** und
rechnen gleich lang — auch ein Konto ohne hinterlegtes Passwort. Sonst
wäre die Maske eine Auskunft darüber, wer im Haus arbeitet.

Zehn Fehlversuche je Name in einer Viertelstunde ergeben 429 mit
`Retry-After`. Je Adresse liegt die Grenze bei fünfzig: Hinter einer
Adresse sitzt oft ein ganzes Büro, und der Tippfehler des Kollegen darf
niemanden sonst aussperren. Beide Grenzen zählen **getrennt** —
zusammengezählt spränge die Bremse schon nach fünf Versuchen.

### Rollen gelten jetzt wirklich

`owner` und `admin` ändern Einstellungen, spielen Sicherungen zurück und
laden ein. `member` und `viewer` arbeiten im Bestand und bekommen dort
403. Solange der Eingang `internal` war, durfte jedes Mitglied alles; mit
offenem Eingang ist das nicht mehr tragbar. Die Einstellungsseite sagt es
vorher, statt es den Server abweisen zu lassen.

**Den Sitzplatz gibt es seit 26.9.2 nicht mehr** (siehe „Der Sitzplatz ist
weg"). Er existierte für **einen** geteilten Olares-Zugang; mit eigener
Anmeldung hätte ein `member` damit den Platz des Eigentümers einnehmen
können. Rechte hängen an der angemeldeten Person.

### Drei Dinge, die nur der Browser zeigte

Alle drei standen in keinem Test und hätten in Betrieb wehgetan:

- **Die Herkunftsprüfung wies jede echte Anmeldung ab.** Der Browser
  spricht mit dem Frontend, das Frontend leitet ans Backend weiter — im
  `Host` steht der interne Dienst, nicht die Adresse aus der Adresszeile.
  Was der Browser sah, steht in `X-Forwarded-Host`.
- **`Secure` hing am Modus statt an der Verbindung.** So trüge der Keks im
  Betrieb `olares` auf der Box kein `Secure`, obwohl dort alles über TLS
  läuft. Jetzt entscheidet `X-Forwarded-Proto`.
- **Der Einladungsschlüssel war für den Eigentümer unsichtbar** (behoben in
  0.6.1). Auf der Box gemessen: Die Mitgliedertabelle war 744 px breit, ihr
  Rahmen 638. Der Knopf der ersten Zeile stand bei 697 bis 748 und damit
  vollständig außerhalb; bei den übrigen Zeilen schob ihn das zusätzliche
  „Entfernen" weit genug nach links, um sichtbar zu bleiben. Ausgerechnet
  die Person, die als erste ein Passwort setzen muss, kam nicht an ihren
  Knopf. Die Tabelle rechnet jetzt mit festen Spalten und kann nicht mehr
  überlaufen; Name und Kennung stehen in einer Spalte übereinander, beide
  Handlungen sind Zeichen mit Beschriftung für Vorleseprogramme.

### Nach einer Neuinstallation

Der Abzug nimmt die Passwort-Hashes mit — ohne sie wäre eine
Neuinstallation im Modus `eigen` eine Aussperrung: Der Olares-Kopf zählt
dort nicht mehr, und ohne Hash käme niemand mehr an der Maske vorbei,
auch der Eigentümer nicht. Offene Einladungen kommen ebenfalls zurück.
`sitzungen` und `anmeldeversuche` bewusst nicht: Eine zurückgespielte
Sitzung wäre ein Wiedereinspielen von Zugängen, eine zurückgespielte
Bremse sperrte Menschen für Tippfehler aus, die lange her sind.

### Zugangsdaten liegen im Tresor

Seit 0.6.6 stehen SMTP- und IMAP-Passwörter, die API-Schlüssel für
Sprachmodell, Suche, Sprachausgabe und Brevo, das Webhook-Geheimnis und
das Relay-Geheimnis **verschlüsselt** in der Datenbank (AES-GCM,
`app/tresor.py`). Sie müssen im Original wieder herauskommen — ein Dienst
meldet sich damit an —, ein Hash wie beim Anmeldepasswort ginge also
nicht.

**Der Schlüssel liegt nicht in der Datenbank**, sondern als Datei
`tresor.key` unter `/app/data` mit Rechten 0600, erzeugt beim ersten
Bedarf. Damit schützt der Tresor genau eine, aber wirkliche Sache: einen
Abzug der Datenbank. Ein Postgres-Dump, ein kopiertes Laufwerk, eine
Sicherung, die irgendwo landet — daraus ist nichts mehr zu benutzen.

**Wogegen er nicht schützt, und das gehört dazugesagt:** Wer im Pod ist,
liest die Schlüsseldatei genauso wie die Datenbank. Ein Tresor, dessen
Schlüssel danebenliegt, trennt zwei Dinge, die sonst zusammen wegkommen —
mehr verspricht er nicht.

`tresor.SPALTEN` ist der Vertrag: Wer eine Spalte mit einem Geheimnis
ergänzt und sie dort vergisst, speichert weiter im Klartext, und niemand
merkt es. Ein Test hält die Liste fest.

Zwei Eigenschaften machen die Umstellung ausfallfrei. `entschluesseln`
gibt zurück, was es nicht kennt — eine Datenbank aus der Zeit davor
funktioniert weiter. Und ein Lauf beim Start holt vorhandenen Klartext
einmal nach; scheitert er, startet die Anwendung trotzdem.

**Geht `tresor.key` verloren**, sind die Zugangsdaten unlesbar und müssen
neu eingetragen werden. Der Abzug enthält sie ohnehin nicht.

### Wo bin ich überall angemeldet

*Einstellungen › Firma und Team › Ihre Geräte* listet die eigenen offenen
Sitzungen mit Gerät und Zeitpunkt und beendet einzelne davon — oder alle
außer dem gerade benutzten. Ohne diese Liste stünde ein vergessener
Browser dreißig Tage offen, ohne dass es jemand sehen könnte.

Beendet wird **serverseitig**: Der Keks auf dem anderen Gerät ist danach
wertlos, nicht bloß versteckt. Sichtbar sind ausschließlich die eigenen
Sitzungen; dafür sorgt die Policy `sitzungen_selbst`, und die Abfrage
prüft zusätzlich auf `user_id` — eine zweite Wand, falls die Policy einmal
gelockert wird. Angezeigt werden weder Token noch Adresse, nur die
Browserkennung, aus der die Oberfläche „Chrome auf Mac" macht.

### Zweiter Faktor (seit 26.9.2)

Nach dem Passwort ein sechsstelliger Code aus einer Authenticator-App
(TOTP nach RFC 6238, jede App tut es). Eingerichtet wird unter
*Einstellungen › Firma und Team › Zweiter Faktor*: QR-Code scannen, einen
Code bestätigen, zehn Wiederherstellungscodes notieren. Erst der
bestätigte Code schaltet ihn ein — wer den QR-Code abbricht, sperrt sich
nicht aus.

- **Anmelden in zwei Schritten.** Stimmt das Passwort, entsteht eine
  *Vorstufe* (Keks `rocket_vorstufe`, nur für `/api/anmeldung`, fünf
  Minuten, `sitzungen.bestaetigt = false`). Sie gilt für nichts außer der
  Code-Eingabe. Erst der Code macht daraus eine Sitzung. Falscher Code:
  403, abgelaufene Vorstufe: 401 und zurück zum Passwort.
- **Kein Code zweimal.** Der zuletzt angenommene Zeitschritt steht an der
  Person (`totp_letzter_schritt`); ein mitgelesener Code ist danach wertlos.
  Ein Schritt Nachsicht in beide Richtungen, mehr nicht.
- **Wiederherstellungscodes** gelten einmal, gespeichert ist nur ihr
  SHA-256 (`zweitfaktor_codes`). Sie laufen durch dieselbe Bremse wie das
  Passwort. Neue erzeugen verlangt einen Code aus der App; Abschalten
  verlangt Passwort **und** Code.
- **Das Geheimnis liegt im Tresor**, verschlüsselt wie die SMTP-Passwörter.
  Der QR-Code entsteht auf dem Server (`segno`) und geht als Bild in die
  Seite — kein fremder Dienst sieht das Geheimnis.
- **Pflicht für alle** schaltet die Eigentümerin oder ein Verwalter im
  selben Block ein, sobald der eigene Faktor steht. Wer dann noch keinen
  hat, bekommt auf jeden Aufruf 403 mit dem Kopf
  `X-Rocket-Zweiter-Faktor: einrichten` und landet auf `/zweiter-faktor`.
  Die Teamliste zeigt vorher, wen das trifft. Unter Pflicht lässt sich der
  eigene Faktor nicht abschalten.
- **Protokoll.** Anmeldung, Abweisung (mit Grund), Abmeldung, Einrichten,
  Abschalten, neue Codes und Zurücksetzen stehen im Audit-Log unter
  `entity = 'anmeldung'`.

Handy **und** Codes weg: Die Datei auf der Box (unten) setzt den zweiten
Faktor mit zurück. Eine neue Einladung tut es ebenso — sie ist ohnehin
die Übernahme des Zugangs.

### Wenn niemand mehr hereinkommt

Das Passwort gehört **nicht** in die Olares-Umgebungsvariablen. Dort stünde
es im Klartext, sichtbar für jeden, der den Einstellungsbildschirm öffnet,
und es sind laut Beschriftung „shared settings for your apps" — also für
jede App auf der Box lesbar. Der ganze Aufbau speichert bewusst nur einen
argon2id-Hash, damit selbst ein Datenbankleser sich nicht anmelden kann;
ein Klartextpasswort daneben hebt das auf. Ein Konto, das aus einer
Variablen käme, wäre außerdem eine dauerhafte Hintertür — genau das, was
ein offener Eingang nicht haben darf.

Der Rettungsweg hängt stattdessen am **Zugang zur Box**, und das ist die
richtige Hürde: Wer an der Box sitzt, kommt ohnehin an alles heran.

Seit 0.7.0 braucht dieser Weg kein Terminal mehr. Auf der Anmeldeseite
steht „Passwort vergessen?". Wer dort seinen Zugang nennt, lässt Rocket
einen Code in den eigenen Datenordner schreiben. In der **Dateien**-App
von Olares liegt er hier:

    Data › rocket › passwort-zuruecksetzen.txt

Code, Zugang und neues Passwort auf der Seite eingeben — fertig.
Fünfzehn Minuten gültig, danach wertlos.

**Die Datei entsteht auch bei falschem Namen** und nennt dann die Zugänge
dieser Box. Auf einer fremden Box ist das der entscheidende Punkt: Dort
weiß der Mensch oft gar nicht, wie sein Zugang heißt — auf Kais Box heißt
Marc `marc-bayer`, auf seiner eigenen anders. Die Seite darf ihm das nicht
sagen, sie steht öffentlich im Netz. Die Datei darf es, denn sie liegt
hinter derselben Hürde wie der Code selbst.

Hat auf der Box **noch niemand** ein Passwort gesetzt, sagt die Datei das
und verweist auf `rocket-einrichten.txt` daneben: Rocket ist dann noch
nicht eingerichtet (siehe „Die Erstinstallation“).

**Der dritte Zustand ist der bittere:** Es gibt Zugänge mit Passwort, aber
keiner gehört noch zu einer Organisation. Dann kommt niemand mehr herein —
die Anmeldung findet keine Organisation, und die Olares-Sitzung greift
auch nicht, weil `noch_unbewohnt()` schon beim ersten Passwort irgendwo
in der Datenbank auf „bewohnt" schaltet. Diese Strenge ist Absicht: Bei
offenem Eingang ist `X-Bfl-User` von außen fälschbar, eine Box mit Daten
darf durch verwaiste Rollen nicht wieder übernehmbar werden. Die Datei
sagt in diesem Fall, dass es nur noch an der Box selbst geht, statt einen
Wegweiser in die Sackgasse zu stellen.

**Der Pfad, den man einem Menschen nennt, ist nicht `/app/data`.** Das
ist der Pfad *im Container*; in der Dateien-App gibt es ihn nicht. Dort
heißt derselbe Ordner `Data` und darunter der Name der App. 0.7.0 nannte
zuerst den Containerpfad, und genau daran ist der erste Versuch auf der
Box gescheitert: Die Datei lag da, nur nicht dort, wo sie gesucht wurde.

**Zusätzlich per Mail (seit 26.9.2).** Hat die Organisation SMTP
eingerichtet und die Person eine Adresse, schickt „Passwort vergessen?"
den Code auch dorthin — 30 Minuten gültig, einmal. Die Datei bleibt der
Weg, der immer geht. Drei Unterschiede zur Datei:

- **Der zweite Faktor bleibt.** Wer nur das Postfach hat, hat nicht das
  Handy; nach dem neuen Passwort wird der Code verlangt. Nur die Datei
  setzt ihn zurück.
- **Der Code geht nie durch `mails`.** Den Postausgang sehen Verwalter im
  Datenbank-Blick — ein Code dort hieße, ein Verwalter könnte das Passwort
  der Eigentümerin zurücksetzen. Rocket schickt direkt über SMTP; in der
  Datenbank steht nur der Hash (`passwort_links`, im Blick gesperrt).
- **Gleiche Antwort, gleiche Dauer.** Der Versand läuft im Hintergrund,
  auch für unbekannte Namen — sonst verriete die Antwortzeit, wen es gibt.

Vier Dinge, die diesen Weg tragbar machen:

- **Der Code steht nie in einer Antwort.** Der Endpunkt sagt nur, wo die
  Datei liegt. Über das Netz ist er nicht zu erfahren.
- **Ein unbekannter Name antwortet genauso.** Sonst wäre dieser Weg das
  Namensverzeichnis, das die Anmeldemaske sorgfältig verschweigt — und
  der Versuch zählt in beiden Fällen in die Bremse, sonst ließe sich an
  ihr ablesen, welche Namen es gibt.
- **Die Datei ist der ganze Datensatz.** Kein Eintrag in der Datenbank.
  Ein zurückgespielter Abzug kann keinen alten Code wiederbeleben.
- **Einlösen beendet jede offene Sitzung** und leert die Bremse. Wer
  zurücksetzt, tut das oft, weil etwas nicht stimmt. (Bis 26.9.1 traf das
  Beenden unter FORCE lautlos keine Zeile — es lief ohne Nutzerkontext.
  Seit 26.9.2 mit Kontext und mit Test.)

Der Weg über die Kommandozeile bleibt daneben bestehen — für den Fall,
dass die Oberfläche selbst nicht mehr hochkommt:

```bash
ssh olares@192.168.1.17
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
POD=$(kubectl get pods -n rocket-kaivostudio --no-headers | grep rocket-backend | awk '{print $1}')
kubectl exec -it -n rocket-kaivostudio $POD -c backend -- python3 -c "
import asyncio, getpass, os, asyncpg
from app.anmeldung import hash_passwort, passwort_pruefen
neu = getpass.getpass('Neues Passwort: ')
passwort_pruefen(neu)
async def m():
    c = await asyncpg.connect(host=os.environ['DB_HOST'], port=int(os.environ['DB_PORT']),
        user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], database=os.environ['DB_NAME'])
    await c.execute('update public.users set passwort_hash = \$1, passwort_am = now(), gesperrt_bis = null where olares_username = \$2', hash_passwort(neu), 'kaivostudio')
    await c.execute('delete from public.anmeldeversuche')
    print('gesetzt')
    await c.close()
asyncio.run(m())
"
```

`getpass` liest das Passwort, ohne es in die Befehlszeile oder in die
Shell-Historie zu schreiben. Die Bremse wird gleich mit geleert, sonst
sperrt die eigene Rateserie den frisch gesetzten Zugang aus.

**Zwei billigere Vorkehrungen**, die den Rettungsweg meist überflüssig machen:

- **Ein zweiter Mensch mit `admin`.** Ein vergessenes Passwort ist dann
  kein Notfall, sondern ein Einladungslink von der anderen Person. Neue
  Personen bekommen `member`; die Rolle lässt sich in der Datenbank auf
  `admin` heben (`user_org_roles.role`).
- **Der Abzug trägt die Hashes.** Eine Neuinstallation sperrt niemanden
  aus, siehe oben.

Notfalls hilft auch der Rückweg: `ANMELDUNG_MODUS` im Deployment
vorübergehend wieder auf `olares`, dann zählt der Olares-Zugang erneut.
Das braucht eine neue Version über den Markt und öffnet währenddessen
nichts, solange der Entrance dabei zurück auf `internal` geht.

### Noch offen

Seit 26.9.2 erledigt: zweiter Faktor, Rücksetzen per Mail, Anmeldungen im
Audit-Log („Andere abmelden" gab es schon unter *Ihre Geräte*). Offen aus
`docs/PLAN-TEAM.md` sind Stufe 2 (persönliches Postfach) und Stufe 3
(feinere Rechte).

Tests: `backend/tests/test_anmeldung.py` — 36 Fälle, darunter der
entscheidende, dass ein gefälschter `X-Bfl-User` im Modus `eigen` weder
Zugang bringt noch einen Nutzer anlegt. Der zweite Faktor und das
Rücksetzen per Mail stehen in `test_zweiter_faktor.py` (22 Fälle, mit den
Testvektoren aus RFC 6238).

## Eigenschaften in Gruppen (seit 26.9.3, vollständig seit 26.9.4)

Nach HubSpots Muster: Jedes Objekt (Firma, Kontakt, Lead) hat Gruppen —
„Firmeninformationen", „Adresse", „Kontaktwege", „Vertrieb" … —, und
jedes Feld steht in genau einer, **die festen ebenso wie die eigenen**.
Plan und Begründung: `docs/PLAN-EIGENSCHAFTEN.md`; alle vier Stufen
sind umgesetzt (A und B in 26.9.3, C und D in 26.9.4).

### Einrichten: Einstellungen › Eigenschaften

- Reiter je Objekt, Suche, Gruppen als Kästen. **Ziehen** ordnet Felder
  innerhalb und zwischen Gruppen; ohne Maus den Griff nehmen und die
  Pfeiltasten — am Ende einer Gruppe geht es in die nächste.
- Gespeichert wird nach jedem Zug die **ganze** Anordnung
  (`PUT /api/eigenschaften/reihenfolge`). Fehlt darin ein Feld, das es
  inzwischen gibt, antwortet der Server 409 — eine veraltete Seite
  verschiebt nicht blind die Arbeit eines anderen.
- **Feste Felder** tragen ein Schloss: verschieben, umbenennen, Hilfetext
  ja; löschen, Typ ändern nein. Der Schlüssel (`city`) bleibt immer.
- **Vorgabegruppen** lassen sich umbenennen, nicht löschen. Eigene Gruppen
  löschen geht; stehen Felder darin, nur mit Zielgruppe.
- Je Feld: „Im Anlegen-Dialog zeigen" (wie HubSpots „Show in create
  form") und die Zahl der Datensätze mit Wert.
- Eigene Eigenschaften werden **archiviert**, nicht gelöscht; die Werte
  bleiben in `custom` und die Eigenschaft lässt sich wiederherstellen.
- Anlegen, Ändern, Ordnen: nur `owner` und `admin` (vorher durfte jedes
  Mitglied eigene Eigenschaften anlegen).

### Die Datensatzseite

„Über diese Firma" zeigt die Gruppen als aufklappbare Abschnitte. Was
zugeklappt ist und ob leere Felder ausgeblendet sind, merkt sich Rocket
**je Person** (`users.einstellungen`: `zugeklappt`, `leere_ausblenden`).

Zwei Wege zu ändern, beide gewollt (Kai, 30.9.2026): der **Stift an einem
Feld** (Enter speichert, Escape bricht ab) und der **Stift im Kopf** für
alles auf einmal. Gerechnetes (Anzahl Kontakte, Wahrscheinlichkeit,
Angelegt) und Felder mit eigenem Weg (Marketing-Einwilligung, Firma am
Kontakt, Stufe am Lead) zeigen keinen Stift.

**Kein `type="url"` im Formular.** Der Browser nähme „gruppe.de" nicht an
und verhinderte das Absenden lautlos — auch wenn nur die Straße geändert
wurde. So ist es im ersten Browserlauf aufgefallen. Die Formulare tragen
`noValidate`; geprüft wird in `lib/feldwerte.ts` und im Backend.

### Pflichtfelder und neue Arten (seit 26.9.4)

- **Pflicht** schaltet man am Feld unter *Einstellungen › Eigenschaften*.
  Geprüft wird beim Anlegen (fehlt → 422 mit den Namen) und wenn eine
  Anfrage ein Pflichtfeld leert. **Rückwirkend gesperrt wird nichts**: Ein
  alter Datensatz ohne Wert lässt sich weiter ändern; die Datensatzseite
  zeigt „fehlt" mit Zeichen. Pflichtfelder erscheinen immer im
  Anlegen-Dialog, der vor dem Absenden prüft.
- **Ausgenommen** sind Einfuhr, Anreicherung und AI — sie legen über
  eigene Wege an. Eine Messeliste scheitert sonst an einem Feld, das auf
  ihr nicht steht. Nie Pflicht werden können Gerechnetes, die
  Marketing-Einwilligung und der Absagegrund.
- **Neue Arten** eigener Eigenschaften (Migration 0035): langer Text,
  Adresse (nur `http(s)://`, `javascript:` nie), E-Mail, Telefon, Betrag
  (ganze Cent, gerundet wird nie) und Person. Eine Person muss zur
  Organisation gehören — geprüft ausdrücklich über
  `current_user_orgs()`, denn `user_org_roles` steht nicht unter FORCE
  und sähe als Tabelleneigentümer jede Organisation der Box.

### Spalten und Filter (seit 26.9.4)

Spaltenwahl und Filterbau zeigen die Felder nach Gruppen, in derselben
Reihenfolge und mit denselben Namen wie auf der Datensatzseite
(`segmente.felder_fuer` liest dafür die Anordnung). Beträge stehen in
Cent; gezeigt und gefiltert wird in Euro, umgerechnet an genau einer
Stelle (`betrag` in der Feldliste). Auch CSV-Ausfuhr und -Einfuhr sehen
die umbenannten Beschriftungen.

**„größer" und „kleiner" an eigenen Zahlen** gingen bis 26.9.3 nicht:
Die Bedingung landete im Textzweig und scheiterte mit „Unbekannter
Operator". Aufgefallen beim Browserlauf für den Betragsfilter. Ein Wert,
der keine Zahl ist (alter Freitext), zählt jetzt als leer, statt die
ganze Abfrage mit einem Cast-Fehler abzubrechen.

### Wie es gespeichert ist

- `property_groups` (Migration 0034, FORCE) je Organisation und Objekt.
- Feste Felder sind Zeilen in `property_definitions` mit `is_system`. Ihr
  Wert bleibt in der Spalte; Typ und Auswahlwerte kommen aus dem Katalog
  im Code (`eigenschaften.SYSTEMFELDER`), die Zeile trägt nur Gruppe,
  Platz, Beschriftung, Hilfetext und die Schalter.
- **Die Vorgaben entstehen nicht in der Migration**, sondern beim ersten
  Lesen, im Kontext der handelnden Person (`vorgaben_sicherstellen`,
  wiederholbar, `on conflict do nothing`). Unter FORCE sähe eine
  Migration ohne Nutzerkontext keine Organisation und schriebe lautlos
  nichts. Kommt mit einer neuen Version ein festes Feld dazu, erscheint es
  von selbst am Ende seiner Gruppe.
- `GET /api/eigenschaften` liefert weiterhin **nur eigene** Eigenschaften
  — die Einfuhr und `custom` erwarten genau das. Die ganze Anordnung gibt
  `GET /api/eigenschaften/anordnung?entity=`.
- Im Abzug stehen Gruppen vor den Eigenschaften. Gibt es eine
  Vorgabegruppe am Ziel schon (andere id), schreibt das Zurückspielen die
  Verweise der Eigenschaften um.

## GUI-Prüfung — was sie fand (26.9.5)

Am 30.9.2026 lief die ganze Oberfläche durch einen Prüflauf: jede Seite
in drei Breiten (1400, 768, 390 px), hell und dunkel, mit axe-core
(WCAG 2 A/AA), dazu jeder harmlose Knopf geklickt, die Anlegen-Dialoge
mit der Tastatur bedient und die Trefferflächen auf dem Handy gemessen.
Behoben in 26.9.5:

- **Aufgaben als Liste scheiterten mit 400.** Die Listenansicht sortiert
  ohne gespeicherte Ansicht nach `updated_at`; Aufgaben kannten das Feld
  nicht. Ein Test prüft die Vorgabesortierung jetzt für alle vier Listen.
- **Dialoge ließen die Tastatur im Stich.** Der Fokus blieb hinter dem
  Dialog, Tab lief hinaus, Escape tat nichts. Jeder Dialog nimmt jetzt
  `useDialogfalle` (`components/dialogfalle.ts`): Fokus ins erste Feld,
  Tab bleibt drin, Escape schließt, danach zurück. Eine Rückfrage vor dem
  Löschen fokussiert „Abbrechen" (`data-autofokus`), damit ein Enter
  nichts löscht. **Ein neuer Dialog nimmt den Haken, immer.**
- **Handy:** Die Positionen eines Angebots schrumpften auf einen Streifen,
  die Prognose blieb zweispaltig, und Server, Port und Verschlüsselung
  beim Versand standen zu dritt in einer Zeile. Spalten, die das Handy
  nicht tragen, kommen jetzt aus CSS mit Umbruch (`.datensatz-zwei`,
  `.datensatz-seitenleiste`, `.feldreihe`), nie mehr inline am Bauteil.
- **Trefferflächen:** Haken, Spaltenköpfe, Rückweg, Verweise im Feld und
  die Marke haben auf Berührungsgeräten eine unsichtbare Fläche von 44 px.
- **Vorleser:** „Erstellen" behält seinen Namen, wenn das Wort auf
  schmalen Schirmen weicht; leere Tabellenköpfe sagen „Aktionen";
  Kennzahlen sind eine gültige Definitionsliste; Leerzustände
  überspringen keine Überschriftenebene mehr; Rollflächen sind mit der
  Tastatur erreichbar.
- **Kontrast:** Zeitangaben in der Zeitleiste und die gewichtete Summe am
  Board standen in der Farbe für Gesperrtes (2,7:1) und nehmen jetzt die
  gedämpfte; die Pille „Opportunity" trägt Gold-900 (5,1:1), im Dunkeln
  ohne Fläche.
- **Kaputte Adresse** (`/angebote/abc`): statt „Anfrage fehlgeschlagen
  (422)" steht „Diese Adresse führt zu keinem Datensatz."

**Nachgezogen in 26.9.6:** Tastaturwege für Listen, Brett, Reiter, Menüs
und Assistent; ein gemeinsames `Dialog`- und `Rueckfrage`-Bauteil; die
wiederkehrenden Inline-Stile als Klassen. Nebenbei behoben: Die
Aufgaben-Tabelle führte ins Leere (404), und am Lead ohne Sprachmodell hing
die Knopfreihe aus dem Seitenkopf. Einzelheiten in `docs/MODULE.md`.

### Der Rundgang läuft in der CI

Seit 26.9.6 prüft der CI-Job **„oberfläche · Rundgang im Browser"** jeden
PR: Er legt eine Datenbank an, spielt die Migrationen ein, startet Backend
und Frontend, lädt die Beispieldaten und geht mit Playwright
(`frontend/e2e/`) durch:

- **`rundgang.spec.ts`** — jede Seite auf Desktop (1400 px) und Handy
  (390 px): keine API-Antwort 4xx/5xx, kein Skriptfehler, nichts breiter
  als der Bildschirm, genau eine `h1`, nichts ragt aus dem Seitenkopf,
  keine axe-Befunde „critical" oder „serious". Ausgenommen ist nur die
  Regel `color-contrast`, bis die Token-Frage unten entschieden ist.
- **`tastatur.spec.ts`** — die Tastaturwege: Anlegen-Dialoge (Fokus, Tab,
  Escape), „Erstellen", Listenzeile mit Enter, Reiter, Brett mit Alt+Pfeil,
  Assistent, Rückfrage vor dem Löschen.

Jeder Prüfpunkt hat einmal einen echten Fehler gefunden; die Gegenprobe
(den Sortierfehler der Aufgaben kurz zurückgenommen) lässt den Rundgang rot
werden. Schlägt er fehl, hängt der Bericht mit Bildschirmfotos am Lauf
(`rundgang-bericht`).

Lokal gegen einen laufenden Stand (Frontend auf 3011, Beispieldaten
geladen):

```bash
cd frontend
npm run e2e                                     # Browser von Playwright
ROCKET_CHROMIUM=/opt/pw-browsers/chromium npm run e2e   # in einer Claude-Sitzung
ROCKET_URL=http://localhost:3000 npm run e2e    # anderer Port
```

**Übersehen und nachgezogen in 26.10.1** — Kai fand es auf seiner Box:

- Der Hinweis „noch kein Passwort“ (und die beiden anderen Hinweise der
  Einstellungen) stand ohne Seitenrand direkt in der Seite: bündig an
  der Navigation, ohne Abstand unter den Reitern. Jetzt in
  `.seitenhinweise`, im Rand der Blöcke, mit Zeichen.
- Das Zeichen jedes Leerzustands stand links, der Text mittig darunter
  — die Grundregeln machen jedes SVG zum Block, und ein Block folgt
  `text-align` nicht.
- Auf der Einfuhr klebte die Ablagefläche ohne Abstand an der Auswahl,
  und der erste Satz saß fast auf der Linie des Seitenkopfs.
- Die Druckfassung behielt auf dem Handy die A4-Ränder; die Positionen
  liefen rechts hinaus.
- Der Hinweistext selbst war zu freundlich: „kommt herein, wer an dieser
  Box angemeldet ist“. Solange niemand ein Passwort hatte, galt der Kopf
  `X-Bfl-User` — und den kann bei offenem Entrance jeder mitschicken.
  Geschlossen mit dem Einrichtungscode (siehe „Die Erstinstallation“).

**Warum die Prüfung es nicht sah:** Der Rundgang prüfte, was sich zählen
lässt — Fehlerantworten, Überlauf der Seite, den Seitenkopf, axe. Ob ein
Kasten im Rand steht, ob er an seinem Nachbarn klebt, ob ein Zeichen
mittig sitzt, prüfte er nicht; die Bilder der GUI-Prüfung waren
überwiegend hell und mit Beispieldaten, in denen kaum ein Leerzustand
vorkommt. Seit 26.10.1 prüft `frontend/e2e/lage.ts` jede Seite in hell
**und** dunkel auf drei Dinge: Text am Rand des Inhalts (außer in
rollenden Bereichen), Kästen ohne Abstand zum Vorgänger, Zeichen im
Leerzustand außer Mitte; ein eigener Test führt einen Leerzustand
herbei. Gegen den alten Stand fällt er an allen vier Stellen oben.

**Kontrast, entschieden in 26.10.3:** Gedämpfter Text
(`--am-text-gedaempft`) war Blau-500 (`#587898`) und erreichte auf der
Grundfläche Blau-25 nur 4,36:1. Kai entschied am 1.10.2026 für `#567595`
— derselbe Farbton, 4,54:1 auf Blau-25 und 4,80:1 auf Weiß. Das ist eine
bewusste Abweichung vom Paket und steht am Token. Auf Blau-50 (4,34:1) und
Blau-100 (3,96:1) bliebe auch dieser Wert darunter; axe fand über alle
Seiten aber keinen gedämpften Text auf diesen Flächen. Würde er dort
nötig, trüge `#4f6c8a` auch auf Blau-100 (4,51:1). **Abgelöst in 26.10.5:**
Fläche 2 ist jede Zeile unter dem Zeiger; seitdem gilt `#4f6c8a` (siehe
„Token aus dem CI“).

Der einzige übrige Befund war das Schildchen „Wunsch“ auf den
Erkenntnissen (Gold-800 auf Blau-50, 4,45:1); es nimmt hell Gold-900 wie
die Stufenpille „Opportunity“. Seitdem läuft der Rundgang **mit** der
axe-Regel `color-contrast`, hell und dunkel.

## Abgleich mit dem CI, Paket 2 (seit 26.10.6)

Die Regeln aus dem Abgleich (`ABGLEICH.md` im CI-Repo, Paket 2), entschieden
von Kai am 1.10.2026 und in Rocket umgesetzt:

| | Was | Wo in Rocket |
|---|---|---|
| R1 | **Löschen ist rot und sagt, was verschwindet:** „Firma löschen“, „Stufe löschen“, nicht „Löschen“. Beim Überfahren wird der Knopf heller (`--am-fehler-hover`). Sekundäre Knöpfe tragen die Textfarbe (im Dunkeln vorher Gold, für sekundär gesperrt). Fokusring mit 2 px Abstand überall | `Stammdaten`/`Feldgruppen` (`loeschknopf`), `pipelines-verwalten.tsx`, `.btn-*` |
| R3 | **„AI“, nicht „KI“**, in Oberfläche, Meldungen, Manifest und Doku. Ausgeschrieben deutsch nur in erklärendem Text. Die Einstellung heißt „Sprachmodell“, der Bereich „AI und Programme“ | `lib/__tests__/wording.test.ts` meldet jedes neue „KI“ in Oberfläche und Backend-Meldungen |
| R5 | **App-Icon mit Rakete statt „R“.** Die Anwender-Apps tragen ein Zeichen im Wappen (Figma, „Icon-Labor“, Abschnitt 0) | `docs/icon/rocket.svg`, alle PNG und das Markt-Icon `icon.png` aus `scripts/app-symbole.mjs` |
| R6 | **Schatten nur für das, was schwebt:** Menüs, Suchtreffer, Mehrfachauswahl, „Mehr“, Dialog, Assistent — mit betontem Rand und dem einen `--am-schatten-1`. Der Knauf des Schalters und die gewählte Wegwahl haben keinen Schatten mehr, sondern einen Rand | `globals.css` |
| R7 | **Rot für Handlungsbedarf, immer mit Uhr und Wort:** „seit 3 Tagen überfällig“, am Lead-Board „· überfällig“. „Verloren“ und „Disqualifiziert“ sind neutral | `components/ueberfaellig.tsx` |
| R9 | **Maße aus dem CI:** Dialoge 440/560/720, Navigation `--am-navigation-breite`, jede Ebene `--am-ebene-*` | `globals.css` |

R2, das eine Icon-Set für alle Apps, kam mit 26.10.9 — siehe unten.

## Ein Icon-Set für alle Apps (seit 26.10.9)

Bis 26.10.8 zeichnete Rocket mit `lucide-react` direkt: 81 Zeichen in sieben
Größen von 11 bis 42 px, Strich 2 oder 1,75 im Raster — also umso dicker, je
größer. Das CI hat dafür ein Set (`marke/icons/ui/` im CI-Repo), und Kai hat
am 1.10.2026 entschieden: **alle Apps zeichnen aus diesem einen Set**
(ABGLEICH.md, R2).

**Der Weg eines Zeichens:**

1. Im CI-Repo erzeugt `werkzeug/icons-erzeugen.py` das Set aus Lucide 1.31.0
   (gebündelt, ISC). Mit 26.10.9 wuchs es von 57 auf 112 Zeichen — um alles,
   was Rocket zeichnet. Gleiches Zeichen, ein Name: Rockets `X` ist dort
   `schliessen`, `Sparkles` ist `ai`.
2. `frontend/symbole/` ist eine unveränderte Kopie der benutzten Zeichen.
   Neu holen: `node scripts/symbole-erzeugen.mjs --ci ../../aimighty-ci`.
3. `scripts/symbole-erzeugen.mjs` schreibt daraus `lib/symbole.tsx`. Die
   Exportnamen sind die von lucide-react (`Search`, `Sparkles` …), eine
   Datei ändert nur ihre Importzeile. Nie von Hand ändern.
4. Gezeichnet wird über HB-SYMBOL (`components/symbol.tsx`).

**Ein Zeichen fehlt?** Erst ins CI-Set (Lucide-Datei nach
`werkzeug/lucide-1.31.0/icons/`, eine Zeile im Erzeuger), dann hier eine
Zeile in `NAMEN` und das Skript mit `--ci` laufen lassen. Nie direkt aus
Lucide.

**Größen nur 16 · 20 · 24 · 40**, der Typ lässt keine andere zu: 16 neben
Text und in Knöpfen (vorher 11 bis 16), 20 in der Navigation (vorher 18), 24
als Hauptzeichen (vorher 24 und 28), 40 im Leerzustand. **Der Strich ist
bei jeder Größe 1,5 px** — HB-SYMBOL rechnet ihn im Raster als `1,5 × 24 /
Größe`. Ein eigenes `strokeWidth` gibt es nicht mehr. Auch der Pfeil im
`select` (ein Bild in `globals.css`) hat jetzt Strich 2,25 bei 16 px.

**Die Funken bleiben das Zeichen für AI** (Kai, 1.10.2026). „Keine
AI-Funken“ meint Effekte — Glitzer, Schimmer, Sterne als Schmuck —, nicht
dieses Strichzeichen.

**Geprüft wird es zweimal:** `lib/__tests__/symbole.test.ts` meldet jeden
Import aus `lucide-react` und jede Abweichung zwischen `symbole/` und
`lib/symbole.tsx`; der Rundgang misst jedes sichtbare Zeichen und meldet
eine Größe außerhalb 16/20/24/40 oder einen Strich, der nicht 1,5 px ist.
Das fand beim ersten Lauf zwei Zeichen, die eine Flex-Zeile neben langem Text
auf 11 px gestaucht hatte — dagegen steht jetzt `svg[data-symbol] {
flex-shrink: 0 }`.

## Token aus dem CI (seit 26.10.5)

**Die Werte kommen seit 26.10.5 aus dem CI-Repo.** Der Token-Block oben in
`frontend/app/globals.css` ([AM-TOKEN]) ist eine unveränderte Kopie von
`tokens/app.css` in `ska1walker/aimighty-ci`. Dort ist die Quelle für Rocket,
Insilo und Relay, entschieden von Kai am 1.10.2026 im Abgleich
(`ABGLEICH.md` im CI-Repo, Paket 1). **Wer einen Wert ändern will, ändert
ihn dort** und kopiert den Block hierher. Ob beide gleich sind, sagt:

```bash
python3 ../aimighty-ci/werkzeug/app-abgleich.py frontend/app/globals.css
```

Was sich mit 26.10.5 geändert hat:

| Was | Vorher | Jetzt | Warum |
|---|---|---|---|
| gedämpfter Text, hell | `#567595` | `#4f6c8a` | Auf Fläche 2 (jede Zeile unter dem Zeiger) 4,34:1, im Dialog 3,96:1 — jetzt überall ≥ 4,5:1. Blau 500 bleibt `#587898`: Es trägt Pfeil und Balken in beiden Modi |
| Text, dunkel | `#ffffff` | `#eef2f6` | Reines Weiß überstrahlt auf Hanseatenblau beim langen Lesen; 16:1 bleibt. Weiß nur noch auf satten Flächen |
| Gold als Schrift | `#8b6c1f` | `#8c6c1f` | ein Wert mit dem Auftritt |
| betonter Rand (sekundärer Knopf, offene Auswahl) | Blau 300 / dunkel Blau 600 | Blau 500 / dunkel Blau 400 | 1,86:1 und 2,34:1 — ein Bedienelement braucht 3:1 (WCAG 1.4.11) |
| Fokusring, dunkel | Gold 900 | Gold 500 | 2,62:1 → 8,06:1 |
| Schrift auf dem Lösch-Knopf und der roten Zählpille, dunkel | Weiß | `--am-handlung-text` (Blau 900) | 2,45:1 → 7,37:1 |
| Bewegung | `--am-dauer-kurz/-lang`, Insilo-Reste, feste 100/140 ms mit `ease` | `--am-dauer-schnell/-mittel/-langsam`, `--am-kurve` | eine Leiter, eine Kurve, wie im Auftritt |

**Bewegung reduziert** heißt seitdem überall: Der Zustand stellt sich
sofort ein (`transition-duration: 0s` unter `prefers-reduced-motion`).
Die zwei Schleifen — das zwinkernde Schild und der Suchbalken — haben
weiter ihre eigenen ruhigen Fassungen.

**Warum die Prüfung das nicht fand:** axe misst Schrift gegen ihren Grund,
und nur, was gerade zu sehen ist — keine Ränder, keinen Fokusring, keine
Zeile unter dem Zeiger, keinen Knopf, den der Rundgang nicht öffnet.
Seitdem rechnet `lib/__tests__/kontrast.test.ts` jedes Paar aus den Token,
hell und dunkel: Text auf jeder Fläche (4,5:1), Schrift auf jedem Knopf
(4,5:1), Rand und Fokusring (3:1). Gegen den Stand von 26.10.4 fällt er an
elf Stellen.

## Untermenü der Einstellungen (seit 26.10.4)

Bis 26.10.3 eine Reihe von sechs Pillen über dem Inhalt — ohne Symbol,
ohne Gruppen, ohne Fokusring, auf dem Handy einfach umgebrochen. Kai
fand das nicht schön gelöst. Seitdem nach Stand der Technik (HubSpot,
Stripe, GitHub): **am Desktop eine senkrechte, mitlaufende Liste links**
in drei Gruppen (Konto · Vertrieb · System) mit Symbolen, **auf dem
Handy eine Übersichtsliste** mit Kurzbeschreibung, aus der man in einen
Bereich wechselt; „‹ Alle Einstellungen“ führt zurück. Entschieden von
Kai am 1.10.2026: Übersichtsliste auf dem Handy, nur Bereiche (keine
Blöcke) in der Navigation. Baustein HB-UNTERNAV (`docs/MODULE.md`), damit
Relay ihn übernehmen kann. Alle Adressen `?bereich=` gelten weiter.

**Nebenbei offen: React #418 im Rundgang.** Zweimal bei rund 600
Aufrufen in der CI (Prognose, Kampagnen am Handy) trat ein
Hydrierungsfehler auf; lokal ließ er sich auch mit 800 Aufrufen, frischen
Kontexten und sechsfach gedrosselter CPU nicht nachstellen, und der
minifizierte Fehler verschweigt, welches Element abweicht. Verdacht ohne
Beweis: `IconMark` von Next (rendert auf dem Server `<meta
name="«nxt-icon»">`, im Browser nichts; es gibt ihn erst, seit es Icons
gibt). Der Rundgang hängt deshalb bei #418 Server-HTML, DOM danach und
alle Konsolenmeldungen an den Bericht — der nächste Fall liefert den
Beweis. Der Test bleibt streng.

## Abgleich mit dem CI, Paket 5: das Grundgerüst (seit 26.10.7)

Am 1.10.2026 hat Kai Insilo, Relay und Rocket nebeneinandergelegt und
entschieden, was jede AImighty-Anwendung gleich baut (CI-Repo,
`ABGLEICH.md` Paket 5, `medien/app.md` „Das Grundgerüst“). Was Rocket
davon umsetzt:

- **Token** `--am-lesespalte` (720 px) und `--am-seitentitel` (28 px) aus
  `tokens/app.css`; der Seitentitel war 22 px — kaum mehr als ein
  Abschnittstitel.
- **Jeder Knopf 8 px** (G3). „Erstellen“ in der Kopfleiste, die
  Navigationszeilen, Einklappen, Lesezeichen und die Ansichtsknöpfe der
  Tickets hatten 4 px — Kai fiel der Unterschied neben dem Suchfeld auf.
  Die Höhe stimmte schon: Suchfeld und Knopf sind beide 40 px.
- **Gewählter Eintrag in der Navigation:** in 26.10.7 eine getönte goldene
  Fläche — auf der Box „keine elegante Lösung“ (Kai). Seit 26.10.8 nur eine
  Goldkante, fette Schrift und das Zeichen in Gold, keine Fläche; in der
  Seitenleiste wie in den Einstellungen. Verglichen wurden auch ein ruhiges
  Blau (im Dunkeln nicht vom Überfahren zu unterscheiden) und Blau mit Kante.
  Nie ein Rahmen, der gehört allein dem Fokus; in Insilo ist es ein Rahmen
  und sieht aus wie der Fokus.
- **Symbolknöpfe** (G4): Jeder Knopf, der nur ein Zeichen trägt, hat Namen
  **und** Tooltip mit demselben Wort. Der Rundgang prüft das auf jeder Seite
  („Symbolknopf ohne Namen oder Tooltip“); beim ersten Lauf fehlte der
  Tooltip an rund zwanzig Stellen, darunter die Stifte der Datensatzseite,
  die Griffe der Eigenschaften und das Plus der Kopfleiste am Handy.
- **Browser-Tab** (G7): nur die Rakete, ohne Kachel und Wappen —
  `docs/icon/tab.svg`, als `app/icon.svg` mit eigener Farbregel (hell Gold
  800, dunkel Gold 500) und als `app/icon1.png` für Safari in einem Gold
  dazwischen. Die Kachel bleibt Apple-Touch-Icon, Manifest und Markt. Der
  Titel nennt zuerst die Seite: „Firmen · Rocket“ (`components/tab-titel.tsx`,
  aus dem Seitenkopf). Next schreibt den Titel aus den Metadaten nach dem
  ersten Zeichnen noch einmal; die Komponente wacht deshalb über `<head>`.
- **Startseite:** „überfällig“ trägt jetzt auch dort die Uhr (R7 war an der
  Startseite vorbeigegangen); der Posten bekommt dafür `ueberfaellig` vom
  Backend, statt dass die Oberfläche das Wort vergleicht.

## Symbol der Web-App (seit 26.9.7)

Bis 26.9.6 gab die Oberfläche kein Symbol an. iOS baute beim „Teilen →
Zum Home-Bildschirm" daraus eine dunkle Kachel mit dem ersten Buchstaben
des Titels, Android und der Browser-Reiter ein leeres Blatt.

**Es gilt ein Symbol: das Rocket-Icon aus `docs/icon/rocket.svg`** (Marcs
Idee 6, dasselbe wie im Markt). Nie ein anderes Bild, nie ein Platzhalter.

**Seit 26.10.6 trägt das Wappen die Rakete statt des „R“.** Die Anwender-Apps
von AImighty tragen ein Zeichen im Wappen: Insilo das Mikrofon, Relay den
Papierflieger, Wings die Feder, Rewind das Zurückspulen. Entschieden von Kai
und Marc am 1.10.2026, festgehalten in Figma („Icon-Labor“, Abschnitt 0) und
im CI (`medien/app.md`, „App-Icons“). Gezeichnet ist es wie Rewind: Lucide,
goldene Linie, Strich 3,4. Das Markt-Icon `icon.png` im Wurzelordner
entsteht seitdem mit demselben Skript.

| Datei | Größe | Form | Wofür |
|---|---|---|---|
| `frontend/app/icon.png` | 64 | Kachel mit Ecken | Favicon im Reiter |
| `frontend/app/apple-icon.png` | 180 | Quadrat ohne Ecken | iOS „Zum Home-Bildschirm" |
| `frontend/public/symbol/rocket-192.png`, `-512.png` | 192, 512 | Kachel mit Ecken | Manifest, `purpose: any` |
| `frontend/public/symbol/rocket-maskable-512.png` | 512 | Quadrat ohne Ecken | Manifest, `purpose: maskable` (Android) |

Die Formen ohne Ecken sind Absicht: iOS und Android runden selbst, eine
eigene Rundung gäbe dort schwarze Ecken. Next hängt `icon.png`,
`apple-icon.png` und `app/manifest.ts` (Name „Rocket", `standalone`) von
selbst in den Kopf.

Neu erzeugen, wenn sich das Icon ändert:

```bash
cd frontend && ROCKET_CHROMIUM=/opt/pw-browsers/chromium node scripts/app-symbole.mjs
```

Gerendert wird mit Chromium und der Geist aus `app/fonts/`, damit das „R"
dasselbe ist wie im Markt-Icon. Der Browser-Rundgang prüft, dass die drei
Link-Tags da sind und jedes Bild als PNG kommt.

Auf dem iPhone: Ein schon angelegtes Lesezeichen behält die alte Kachel —
einmal vom Home-Bildschirm entfernen und neu hinzufügen. Durch `standalone`
öffnet es sich danach ohne Safari-Leisten; iOS führt für so geöffnete
Web-Apps eigene Cookies, also einmal neu anmelden.

## Datenbank ansehen — lesend, unter Zeilensicherheit

Seit 26.9.1 unter *Einstellungen › Daten › Datenbank öffnen* (`/datenbank`),
nur für `owner` und `admin`: die Tabellen der eigenen Organisation
durchblättern, sortieren, in einer Spalte suchen, und im Reiter **SQL**
eigene Abfragen stellen, das Ergebnis auch als CSV.

### Warum kein pgweb, kein Adminer

Die Fachtabellen stehen unter `FORCE ROW LEVEL SECURITY`, und die
Richtlinien lesen `app.current_user_id`. Ein fremder Datenbank-Browser
setzt den Wert nicht und sähe jede Tabelle **leer** — derselbe Effekt wie
beim Nachzählen ohne Nutzerkontext (siehe oben). Eine Rolle, die die
Zeilensicherheit umgeht, kann die von Olares vergebene Rolle nicht
anlegen, und wenn sie es könnte, wäre die Mandantentrennung löchrig.
Also läuft der Blick durch Rocket selbst, über `acquire_as`, und kostet
keinen Container und keinen Eingang.

### Die Lücke, die „nur lesend" nicht schließt

Die Mandantentrennung hängt an einer Sitzungsvariable, und die darf jede
Abfrage umsetzen: `select set_config('app.current_user_id', '<andere Kennung>', true)`,
oder versteckt in einem Text, den `query_to_xml('…')` ausführt. Ein
Verwalter läse damit die Sitzungen des Eigentümers — und `READ ONLY`
hält das nicht auf, denn gelesen wird ja nur.

Deshalb zerlegt `app/datenbank.py` jede Abfrage **vor** dem Ausführen mit
pglast (dem Parser von Postgres selbst) und lässt nur durch:

- genau eine Anweisung, und die ist ein SELECT (auch WITH, VALUES, TABLE)
- Tabellen aus `FREI`, nur im Schema `public`
- Funktionen aus `FUNKTIONEN` — eine Erlaubnisliste, keine Sperrliste
- kein SELECT INTO, kein FOR UPDATE, kein WITH, das wie eine echte Tabelle heißt

Dahinter liegen trotzdem `SET TRANSACTION READ ONLY`, `statement_timeout`
von 10 Sekunden und höchstens 1.000 Zeilen am Bildschirm (100.000 in der
CSV). Die Prüfung ist die Tür, die Transaktion das Schloss dahinter; ein
Test nimmt die Prüfung heraus und zeigt, dass ein INSERT trotzdem scheitert.

### Gesperrt, und warum

| Tabelle | Grund |
|---|---|
| `users` | Passwort-Hashes, Zweitfaktor |
| `sitzungen` | wer sie liest, kann sich als jemand anderes ausgeben |
| `anmeldeversuche` | gehört zur Anmeldung |
| `einladungen` | offene Einladungen mit Schlüssel |
| `org_settings` | Zugangsdaten für Sprachmodell, Suche, SMTP, Postfach |
| `webhook_sources` | Geheimnisse der verbundenen Programme |
| `oeffentliche_links` | Schlüssel der Links in Mails |

**Jede neue Tabelle muss entschieden werden.** `test_jede_tabelle_ist_frei_oder_gesperrt`
bricht, sobald eine Tabelle weder in `FREI` noch in `GESPERRT` steht —
dieselbe Wache wie beim Abzug. Sonst wäre die nächste Tabelle mit einem
Geheimnis von selbst sichtbar.

### Was protokolliert wird

Jede SQL-Abfrage, auch eine abgewiesene (`action = 'sql'`, `entity =
'datenbank'`, der Text im `diff`), und jede CSV-Ausfuhr (`action =
'export'`). Das Blättern in einer Tabelle nicht: Es zeigt nichts, was die
übrigen Seiten nicht auch zeigen.

## Dokumente am Datensatz

Seit 0.6.8 kann an Firma, Kontakt, Geschäft und Ticket eine Datei liegen —
das Angebot als PDF, der unterschriebene Vertrag, das Foto vom
Zählerstand. Der Block steht rechts, unter allem anderen: Man sucht ihn
selten, und wenn man ihn sucht, weiß man wo.

**Die Datei liegt nicht in der Datenbank.** Sie steht unter
`/app/data/dokumente/<org>/<kennung><endung>`, dem einzigen Pfad, den
Olares als dauerhaft zusichert. Als `bytea` in der Datenbank wäre der
stündliche Abzug nicht mehr 130 Kilobyte, sondern Hunderte Megabyte, und
jede Auslieferung müsste vollständig durch den Arbeitsspeicher.

**Der Dateiname kommt nie in einen Pfad.** Auf der Platte heißt die Datei
nach ihrer Kennung; der Name, den ein Mensch sieht, steht in der
Datenbank. `../../../../etc/passwort.txt` ist damit ein hässlicher
Anzeigename und kein Angriff — `test_dokumente.py` lädt genau den hoch
und prüft, wo die Datei landet.

**Ausgeliefert wird als Anhang, nicht als Seite.** Nur Bild und PDF darf
der Browser im Fenster zeigen. **SVG gehört ausdrücklich nicht dazu**: Es
ist ein Dokument mit Skriptfähigkeit, und im Ursprung von Rocket
angezeigt liefe fremdes Skript mit allen Rechten des Angemeldeten. Dazu
kommen an jeder Auslieferung `X-Content-Type-Options: nosniff` (sonst
könnte eine als PNG deklarierte HTML-Datei doch als Seite laufen) und
`Content-Security-Policy: default-src 'none'; sandbox`.

**Grenze 25 MB.** Darüber wird es ein Dateiserver, und dafür gibt es
Drive auf der Box. Die Zahl steht in `backend/app/dokumente.py`, damit
Test und Fehlermeldung dieselbe nennen.

**Löschen löscht wirklich.** Anders als bei Kontakten gibt es keine
dreißig Tage: Eintrag und Datei verschwinden zusammen. Bei einem Dokument
ist „gelöscht, aber noch da" die Zusage, die man am wenigsten brechen
will.

**Im Abzug steht die Zeile, nicht der Inhalt.** `dokumente` ist Teil der
Sicherung, mitsamt dem Pfad. Der Pfad wird beim Zurückspielen **nicht**
umgeschrieben, obwohl er die alte Org-Kennung trägt: `/app/data`
überlebt eine Neuinstallation, der alte Ordner steht also noch da, und
ein umgeschriebener Pfad zeigte ins Leere.

Tests: `backend/tests/test_dokumente.py` — 16 Fälle, darunter der
Pfadausbruch, die SVG-Auslieferung, die Größengrenze und die fremde
Organisation, die weder sieht noch holt noch löscht.

## CSV hinein und hinaus

Seit 0.8.0 kommen Kontakte und Firmen als Tabelle herein und die Liste,
die man gerade gefiltert hat, als Tabelle heraus.

- **Hinein:** auf der Liste selbst, hinter dem Hauptknopf —
  „Kontakt anlegen ▾ → Aus CSV importieren", dasselbe bei den Firmen. Das
  öffnet `/import`. Nur Eigentümer und Verwalter dürfen es: Ein Import
  schreibt tausendfach in einen Bestand, den andere pflegen. Unter
  Einstellungen › Daten steht nur noch der Wegweiser dorthin — wer auf
  eine leere Kontaktliste schaut, sucht den Import nicht in den
  Einstellungen (HubSpot macht es genauso, 9.9.2026).
- **Hinaus:** der Knopf „Exportieren" neben „Spalten" in der Liste der
  Kontakte oder Firmen. Jedes Mitglied darf das; die Datei zeigt nur, was
  die Liste ohnehin zeigt.

### Der Sitzplatz ist weg (seit 26.9.2)

Bis 26.9.1 konnte man am geteilten Olares-Zugang den *Sitzplatz* einer
anderen Person einnehmen (Kopf `X-Rocket-Sitzplatz`, Keks
`rocket-sitzplatz`). Mit eigener Anmeldung ist jede Person bereits sie
selbst; der Wechsel war nur noch eine Umgehung. Das Backend liest den Kopf
nicht mehr, die Oberfläche hat die Auswahl nicht mehr, ein alter Keks im
Browser schadet nicht. Weitere Personen heißen in der Datenbank weiter
`zugang = 'sitzplatz'`; das ist nur noch der Name der Spalte.

Zwei Dinge sind dabei mit aufgefallen und behoben:

- **Gleicher Name, fremde Organisation.** Legte eine zweite Organisation
  auf derselben Box „Marc Bayer" an, bekam sie den Nutzer `marc-bayer` der
  ersten — und mit der Einladung dessen Passwort. Jetzt bekommt jede neue
  Person eine eigene Kennung (`marc-bayer-2`, …). Doppelte Namen in
  *einer* Organisation werden am Anzeigenamen erkannt.
- **Entfernt heißt abgemeldet.** Die Sitzung einer entfernten Person galt
  weiter (sie sah unter der Zeilensicherheit nur nichts mehr). Jetzt
  prüft jede Anfrage die Mitgliedschaft; ohne sie ist die Sitzung wertlos.

### „Dieser Sitzplatz gehört nicht zu Ihrer Organisation" (bis 26.9.1)

Der Sitzplatz liegt in einem Cookie im Browser, die Personen liegen in
der Datenbank. Eine Neuinstallation legt die Datenbank neu an — der
Platz zeigt danach auf jemanden, den es nicht mehr gibt, und **jeder**
Aufruf scheitert mit dieser Meldung. Die Oberfläche lädt, aber nichts
geht, und an den Sitzplatz denkt in dem Moment niemand. Marc saß am
9. September 2026 genau darin fest, nachdem er Rocket samt Datenordner
gelöscht und neu installiert hatte.

Seit 0.8.3 trägt die Abweisung den Kopf `X-Rocket-Sitzplatz: unbekannt`.
Die Oberfläche erkennt daran genau diesen Fall, räumt den Platz weg und
lädt einmal neu — danach ist man schlicht man selbst. **Am Meldungstext
darf sie es nicht festmachen:** der ist für Menschen und ändert sich.

Ohne Platz verliert niemand Rechte. Der Sitzplatz ist Zuschreibung, keine
Anmeldung; ihn wegzuräumen gibt nur die Zuschreibung auf.

Von Hand geht es weiterhin: unten links im Konto-Menü einen Platz wählen,
oder im Browser den Keks `rocket-sitzplatz` löschen.

### Rollen — wer auf einer fremden Box helfen darf

Bis 0.9.1 bekam jede angelegte Person fest die Rolle `member`, und es gab
**keinen** Endpunkt, der sie ändert. Wer jemandem auf seiner Box helfen
lassen wollte, hatte genau zwei Wege: sein eigenes Passwort weitergeben,
oder es selbst tun. Kai konnte auf Marcs Box nichts prüfen, und Marc
konnte ihn nicht dazu berechtigen (10.9.2026).

Seit 0.9.2 gibt es `PATCH /api/mitglieder/{id}/rolle` mit `admin` oder
`member`, und in der Mitgliederliste unter „Wer hier arbeitet" steht ein
Schalter in der Zeile. Vier Riegel:

- **Nur die Eigentümerin vergibt Rollen**, nicht `verwaltet`. Ein
  Verwalter darf schon alles, was die Einstellungen schützen; dürfte er
  auch Rollen setzen, könnte er die Eigentümerin herabstufen und sich die
  Organisation aneignen. Das Eigentum ist der eine Punkt, an dem eine
  Rolle nicht reicht.
- **Die eigene Rolle bleibt stehen** — sonst sperrt sich die Eigentümerin
  aus ihrer eigenen Organisation aus.
- **Die Rolle der Eigentümerin bleibt stehen**, geprüft in der SQL
  (`r.role <> 'owner'`), nicht nur im Vorspann.
- **`owner` lässt sich nicht vergeben.** Eigentum zu übergeben ist etwas
  anderes als eine Rolle zu setzen und braucht seinen eigenen Weg.

Geprüft wird die Rolle der **angemeldeten** Person (`handelnder`).

`viewer` steht im Datenbank-Typ, bewirkt aber nichts: Für die Rechte ist
es dasselbe wie `member` (`auth.VERWALTET`). Es wird deshalb nirgends
angeboten — eine Abstufung zu versprechen, die es nicht gibt, wäre
schlimmer als sie wegzulassen.

In 0.9.2 stand der Schalter unter der Zugangsplakette in derselben
Zelle. Das war falsch, aus zwei Gründen: Eine runde Plakette und ein
eckiger Kasten übereinander sind zwei Sprachen, und der Kasten war mit
28 px unter der Zielgröße von 40 px, die das Designsystem ohne Ausnahme
vorschreibt. Seit 0.9.5 hat die Rolle eine eigene Spalte mit einem
Auswahlfeld in voller Zielgröße; „zuletzt hier" ist unter die
Zugangsplakette gerückt, wo es hingehört — beides sagt etwas über den
Zugang. Vier Spalten bleiben es: Person, Zugang, Rolle, Handlungen.
Nachgemessen: 603 px, kein Überlauf.

**Nebenbei gefunden:** Irgendwo in der Grundlage steht `appearance: none`
auf Formularfeldern. Damit hatte **jedes** Auswahlfeld der Anwendung sein
Zeichen verloren und sah aus wie ein Textfeld — man sah der Rolle nicht
an, dass man sie ändern kann, und dem Stufenfeld im Firmendialog nicht,
dass es eine Liste öffnet. Seit 0.9.5 tragen sie wieder eines, als
Data-URI ganz am Ende von `globals.css`. Zwei Fallen dabei: Das Zeichen
muss als `background-image` gesetzt werden, weil `.feld select` mit der
Kurzform `background:` arbeitet und ein Bild sonst wieder löscht — und es
muss in derselben Regel stehen wie das Polster, sonst gewinnt die
spezifischere. Die Farbe ist fest `#587898`, `--am-blau-500`: Ein
Data-URI kennt keine CSS-Variablen, und dieser Wert ist als
„Wendepunkt — in beiden Modi lesbar" genau dafür gewählt.

### Nach einem Neustart einmal 500

Das Frontend ist nach einem Neustart der Box eher da als das Backend. Der
Next-Proxy findet dann noch niemanden und antwortet **selbst** mit 500 —
im Backend-Log steht davon nichts, was die Suche verwirrt. Auf dem
Bildschirm stand „Anfrage fehlgeschlagen (500)", und erst ein Neuladen
half.

Seit 0.8.2 wiederholt die Oberfläche solche Abfragen: viermal mit
wachsendem Abstand (0,4 s bis 3,2 s). Nach gut sechs Sekunden steht das
Backend, und niemand merkt etwas. Alles Vierhundertere wird **nicht**
wiederholt — ein 401 gehört zur Anmeldung, ein 403 zur Rolle, ein 404 zum
Datensatz; sie fielen beim dritten Versuch nicht anders aus.

### Nichts wird überschrieben

Eine Zeile, deren Kontakt es schon gibt, wird **übersprungen und
genannt** — mit Zeilennummer und Grund. Der teure Fehler wäre der andere:
eine Datei mit einer verrutschten Spalte, die stillschweigend
fünfhundert gepflegte Datensätze überschreibt.

Erkannt wird eine Dublette am Kontakt über die E-Mail-Adresse, an der
Firma über die Domain und sonst über den Namen ohne Rechtsform
(„Nordwind Logistik GmbH" trifft „Nordwind Logistik"). Beides gilt auch
**innerhalb** der Datei: Zwei Kontakte derselben neuen Firma ergeben eine
Firma, nicht zwei.

### Die Form der Datei

| Frage | So | Warum |
|---|---|---|
| Trennzeichen hinaus | `;` | Deutsches Excel liest das Listentrennzeichen aus den Regionaleinstellungen; mit `,` steht die Zeile in einer Spalte. Herein werden `;`, `,` und Tabulator erkannt. |
| Kodierung hinaus | UTF-8 **mit BOM** | Ohne BOM steht in Excel „BÃ¶hm". |
| Kodierung herein | BOM, sonst UTF-8, cp1252, latin-1 | Excel schreibt cp1252, HubSpot UTF-8 mit BOM. Die Vorschau **nennt**, was gelesen wurde — ein Umlautfehler ohne Absender ist schwer zu finden. |
| Datum | hinaus ISO, herein auch `TT.MM.JJJJ` | ISO ist eindeutig und sortiert; Deutsch wird gelesen, weil Menschen so tippen. |
| Zahl | Komma als Dezimalzeichen | Bei `;`-Trennung erwartet deutsches Excel es so. `12.5` wird dort sonst zum **12. Mai**. |
| Auswahl | hinaus der Text („Kunde"), herein Text **oder** Wert | Lesbar und rundlauffähig. Ein unbekannter Wert überspringt die Zeile; die Optionsliste wird **nie** erweitert. |
| Mehrfachauswahl | `Wert A \| Wert B` | `;` ist das Dateitrennzeichen und HubSpots bekannte Falle (Migration 0015), `,` steht in Werten („ISO 9001, 27001"). |
| Zellen mit `=`, `+`, `-`, `@` | bekommen ein führendes `'` | Sonst ist ein Firmenname wie `=HYPERLINK(...)` für Excel eine Formel. Die Einfuhr nimmt genau dieses eine Zeichen wieder weg. |

Grenze: **10 MB und 20.000 Zeilen**. Darüber ist es ein Umzug und gehört
zu `pg_dump`, nicht in ein Formular.

### Was die Einfuhr nicht anfasst

- **Sie reichert nicht an.** Fünftausend Hintergrundläufe gegen Suchdienst
  und Sprachmodell wären ein Selbst-DoS und eine Rechnung. Der Knopf am
  Datensatz bleibt.
- **Marketing-Einwilligung kommt nicht mit.** Eine Einwilligung braucht
  einen Nachweis; eine Zelle in einer Tabelle ist keiner.
- **`Angelegt` und `Zuletzt geändert` auch nicht.** Sie entstehen beim
  Schreiben; ein Datum aus der Datei wäre eine Behauptung über die eigene
  Historie.

### Alles oder nichts

Geht mitten in der Datei etwas Unerwartetes schief, rollt die
Transaktion zurück und es ist nichts geschrieben. Ein halber Import ist
schlimmer als keiner — man sieht ihm nicht an, wo er aufgehört hat. Der
Fehlschlag steht trotzdem unter „Bisherige Importe", sonst bliebe von dem
Versuch nichts übrig.

### Was protokolliert wird

Jeder angelegte Datensatz bekommt einen Eintrag im Audit-Log mit
Dateiname und Zeilennummer. Übersprungene Zeilen haben keinen Datensatz
und damit keinen Eintrag — für sie gibt es die Tabelle `einfuhren` mit
Bilanz, Gründen und der angewandten Spaltenzuordnung. Sie steht im Abzug:
Ohne sie ließe sich nach einer Neuinstallation nicht mehr erklären, was
ein Import getan hat.

Jede **Ausfuhr** steht ebenfalls im Audit-Log (`export`, mit Zeilenzahl,
Filter und Spalten). Sie verlässt die Box; das ist dieselbe Art von
Ereignis wie ein Anreicherungslauf.

### Eine HubSpot-Datei

Die Kopfzeilen eines HubSpot-Exports werden erkannt, deutsch und
englisch: „Vorname/First Name", „E-Mail-Adresse/Email", „Zugehöriges
Unternehmen/Associated Company", „Kontaktinhaber/Contact Owner" und so
fort. Liegen bleiben Verlauf, Aktivitäten, Einwilligungen und
Erstellungsdaten — das ist Einfuhr von Daten, nicht Umzug eines Systems.

Excel: „Speichern unter → CSV UTF-8". Eine `.xlsx` wird abgewiesen und
sagt genau das.

Tests: `backend/tests/test_csvform.py` (59 Fälle, die reine Form),
`test_einfuhr.py` (39), `test_ausfuhr.py` (15, darunter der Rundlauf:
Ausfuhr → Einfuhr in eine zweite Organisation).

## Oberflächenfehler stehen im Pod-Log

Zerbricht die Oberfläche („Application error: a client-side exception“),
zeigt Rocket seit 0.5.0 eine deutsche Fehlerseite (`app/error.tsx`) mit
„Neu laden“ — und schickt Meldung, Stack, Pfad und Browser an
`POST /api/fehler` (`routers/fehler.py`). Der Endpunkt schreibt sie ins
Protokoll des Backend-Pods, nichts sonst:

```bash
ssh olares@192.168.1.17 "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl logs -n rocket-kaivostudio deploy/rocket-backend -c backend --since=24h | grep -A12 Oberflächenfehler"
```

`components/fehlermelder.tsx` hört außerdem auf `error` und
`unhandledrejection` des Fensters, höchstens fünf Meldungen je Seite,
per `fetch` mit `keepalive` — nie über `api.post`, der Fehlerpfad darf
selbst nicht werfen.

Der erste Fund auf diesem Weg kam noch vor dem Release: Das Schild des
Assistenten würfelte seinen Blinzel-Versatz beim Rendern, auf dem Server
anders als im Browser — ein Hydrierungsfehler auf jeder Seite (0.4.1).
Seit 0.5.0 wird erst nach dem Einhängen gewürfelt.

Der zweite Fund war der Absturz selbst (0.5.2): `TypeError: u is not a
function` in Reacts Effekt-Aufräumen. Der Assistent hatte
`useEffect(() => ende.current?.scrollIntoView(…), [verlauf])` ohne
Klammern — und **Chrome 152 gibt aus `scrollIntoView` ein Promise
zurück** (in Kais Browser gemessen). React 19 ruft den Rückgabewert eines
Effekts als Aufräumfunktion auf; ein Promise ist keine. Regel seitdem:
kein Effekt ohne Block, damit nie etwas zurückkommt, das keine Funktion
ist.

## Veröffentlichen — Abbilder, Chart, Markt

**Versionsschema seit 26.9.1: `YY.M.<n>`** wie im AImighty-Markt —
`26.9.1` ist die erste Version im September 2026, `26.10.1` die erste im
Oktober; der Zähler beginnt jeden Monat neu, der Monat steht **ohne**
führende Null (`26.09.1` ist kein gültiges SemVer, `market upgrade`
hinge daran). Bis 0.13.0 zählte Rocket (und davor Beacon) `0.x.y`;
0.14.0 wurde nie veröffentlicht und ist in 26.9.1 aufgegangen. Der
Sprung von `0.13.0` auf `26.9.1` ist nach SemVer ein Update.
`scripts/check-chart.sh` prüft das Schema. Regeln des Markts selbst:
`docs/MARKT.md`.

Der Weg ist derselbe wie bei Insilo, nur kürzer. Die Version steht an
**drei** Stellen und muss überall gleich sein — `scripts/check-chart.sh`
bricht sonst ab:

- `olares/Chart.yaml` → `version` **und** `appVersion`
- `olares/OlaresManifest.yaml` → `metadata.version` **und** `spec.versionName`
- `OlaresManifest.yaml` in der Wurzel ist eine **Kopie** des Chart-Manifests
  (`cp olares/OlaresManifest.yaml .`) — Marcs Regel für den Markt, der
  Guard in `check-chart.sh` verlangt Gleichheit

Das Proxy-Ziel des Frontends (`BACKEND_URL`) wird **beim Bau**
eingebrannt — `next.config.mjs` liest es in `rewrites()`, und das
Standalone-Abbild kennt zur Laufzeit keine Rewrites mehr. Das
Dockerfile setzt es auf `http://rocket-backend:8000`; 0.1.1 lief ohne
diese Zeile gegen `localhost` und jede API-Anfrage endete mit 500.

Zwei Manifest-Angaben, die auf der Box den Unterschied machen:
`options.apiTimeout: 0` (sonst kappt der Envoy-Sidecar jede Antwort nach
15 Sekunden, und das Modell antwortet synchron im Request) und
`options.dependencies` mit `>=1.12.6-0` (v3-Pflichtform). Jede
Chart-Änderung, auch eine an Beschreibungen, braucht eine neue Version:
Der Katalog-Hash entsteht aus Name und Version, sonst synchronisiert
Olares nicht.

Der Image-Tag steht nirgends: Er folgt `Chart.AppVersion`
(`values.yaml` trägt `tag: ""`). Das ist Absicht — Olares spielt beim
Aktualisieren die Werte der Erstinstallation zurück, die Chart-Metadaten
kommen frisch an (Insilo v0.1.80, ausführlich in
`insilo/docs/HANDOFF.md`).

```bash
# 1. Version an den drei Stellen setzen, prüfen, per PR nach main mergen
bash scripts/check-chart.sh
git commit -am "release: v26.9.1"

# 2. Nichts weiter: Der Merge nach main startet release.yml. Ist die Version
#    in olares/Chart.yaml noch nicht getaggt, baut der Workflow
#    ghcr.io/ska1walker/rocket-{frontend,backend}:26.9.1 (öffentlich, amd64),
#    legt DANACH Tag v26.9.1 und ein Release an und hängt
#    rocket-26.9.1.tgz daran. Ist sie schon getaggt, passiert nichts.
#    (Ein Tag von Hand — git tag v26.9.1 && git push origin v26.9.1 — geht weiter.)
gh run watch

# 3. Chart packen und mit dem Olares-Prüfer ansehen — immer das Paket,
#    nie den Ordner (der Prüfer verlangt Ordnername == Chart-Name)
helm package olares -d dist
olares-cli chart lint dist/rocket-26.9.1.tgz --with-rbac --with-security-context

# 4. Auf der eigenen Box installieren, bevor irgendetwas in einen Markt geht
olares-cli profile login --olares-id <id>       # macht Kai selbst (Browser, TOTP)
olares-cli market upload dist/rocket-26.9.1.tgz
olares-cli market install rocket
```

**Der Tag entsteht beim Merge (seit 26.9.1).** Claude-Sitzungen dürfen
nur ihren Arbeitsbranch pushen, keine Tags — mergen dürfen sie. Deshalb
setzt `release.yml` den Tag selbst, sobald auf `main` eine Version steht,
die es als Tag noch nicht gibt; erst nach erfolgreichem Bau, damit ein
gescheiterter Bau keinen Tag hinterlässt. Der Tag entsteht mit
`GITHUB_TOKEN` und löst den Workflow kein zweites Mal aus. Ein Merge ohne
Versionssprung ist kein Release. Das Chart liegt als Anhang am Release —
dieselbe Datei, die in den Markt geht.

**Seit 26.10.7 geht der Markteintrag von selbst.** Nach dem Release baut
die Action `markt.yml` den Eintrag auf Marcs frischem `main`, beweist ihn mit
wrangler, öffnet den PR und mergt ihn (Kai, 1.10.2026, „ganz automatisch“).
Was dafür im Release-PR stehen muss: die Notiz `olares/markt/<version>.md`
(Titel, englischer Text) — `check-chart.sh` verlangt sie. Einzelheiten und
das Geheimnis `MARKT_TOKEN`: `docs/MARKT.md`, „Der Weg in den Markt“.

**Erst ausrollen, dann hochladen** galt bis 26.10.6: Eine App, die nie
`running` erreicht hat, gehört in keinen Katalog. Kai hat die Regel mit der
Action abgelöst; geprüft wird vorher in der CI (Rundgang im Browser) und mit
wrangler, ausgerollt danach über den Markt.

**Der Markt** ist die eigene Quelle von aimighty
(`bayerhazard/aimighty-market`, Cloudflare Pages). Ein Eintrag besteht
aus dem Block in `functions/_apps.ts` und dem base64-gepackten Chart
unter dem Schlüssel `rocket-<version>.tgz` in `functions/_lib.ts`. Kai
hat dort Schreibrechte; der Weg bleibt Fork (`ska1walker/aimighty-market`),
Branch, Pull Request — Rocket 26.9.1 kam so als PR #81 hinein
(30.9.2026). Wie Claude das ohne Handgriff erledigt, steht in
`docs/MARKT.md`, „Wie Claude einen Markt-PR anlegt". Vor dem PR alle vier Endpunkte lokal beweisen
(`npx wrangler pages dev functions --port 8788`): `/api/v1/appstore/info`
listet die App, `/api/v1/applications/rocket/chart` liefert die Bytes
sha256-gleich, `/api/v1/appstore/hash` hat sich bewegt. Insilos
Einreichung (PR #1 dort) ist die Vorlage; die Regeln stehen im Skill
`insilo/.claude/skills/olares-release/SKILL.md`.

**Die Empfangspfade** `/api/eingang/…` und `/api/post/eingang/…` liegen
hinter dem Envoy-Sidecar des Frontends. Solange der Entrance `internal`
war, leitete er Insilo und Relay ohne Authelia-Keks zur Anmeldung um.
Seit 0.6.9 steht er auf `public`; am 15.9.2026 kam ein Aufruf aus dem
Insilo-Pod bis in Rockets eigenen Code durch (401 „Unbekannte oder
abgeschaltete Quelle", siehe „Insilo anschließen"). Eine
`options.policies`-Regel ist nicht mehr nötig — das Tor ist die Signatur.
