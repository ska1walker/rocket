# Plan: Eigenschaften in Gruppen, nach HubSpots Muster

> **Stand:** 30. September 2026 · **Status:** Stufen A und B umgesetzt (26.9.3), C und D geplant
> **Entschieden von Kai am 30.9.2026:**
> - **Alle Felder in Gruppen**: Auch die festen (Name, Adresse, Telefon …)
>   gehören einer Gruppe an und lassen sich verschieben. Löschen lassen sie
>   sich nicht.
> - Auf der Datensatzseite als **aufklappbare Abschnitte**.
> - Beschriftung fester Felder **änderbar**, Schlüssel fest; **einzeln
>   bearbeiten** per Stift und alles auf einmal; **Tickets und Aufgaben**
>   vorerst ohne Gruppen.
> - Dazu kommen **Pflichtfelder**, **Ordnen per Ziehen**, **neue Feldarten**,
>   **Gruppen in Spaltenwahl und Filterbau**. Das Vorbild ist HubSpot.

## Ausgangslage

- **Eigene Eigenschaften** gibt es seit 0.3.0 (Migration 0008) für Firma,
  Kontakt und Geschäft:
  - Arten: Text, Zahl, Datum, Ja/Nein, Auswahl und Mehrfachauswahl.
  - Die Werte liegen in `custom jsonb` und werden beim Schreiben in
    `app/eigenschaften.py` geprüft.
  - Eine Definition hat `position` und `is_active`, aber keine Gruppe.
- **Die festen Felder** stehen an drei Stellen:
  - fest verdrahtet in den Datensatzseiten,
  - in `segmente.FELDER` für Listen und Filter,
  - in den Anlegen-Dialogen.

  Es gibt keine gemeinsame Beschreibung, die Oberfläche und Filter lesen.
- **Die Folge:** Wer Rocket einrichtet, kann Felder nicht ordnen. Eigene
  Eigenschaften hängen als Block „Eigenschaften" unter den festen Feldern.
  In der Spaltenwahl stehen alle Felder in einer langen Liste.

## Das Muster aus HubSpot, auf Rocket übertragen

| HubSpot | Rocket |
|---|---|
| Property groups je Objekt („Company information", „Address") | `property_groups` je Organisation und Objekt |
| Default properties (nicht löschbar, Typ fest) | Systemeigenschaften: feste Spalten, beschrieben als Definition mit `is_system` |
| Custom properties | wie heute, in `custom jsonb` |
| „About this company": Abschnitte mit Gruppe | linke Spalte der Datensatzseite, Abschnitte aufklappbar, Zustand je Person gemerkt |
| Einstellungen › Properties: Suche, Filter nach Gruppe, „Used in N records" | Einstellungen › Eigenschaften, Reiter je Objekt, Suche, Nutzungszähler |
| Archivieren statt Löschen | gibt es schon (`is_active`); wiederherstellbar machen |
| „Required" / „Show in create form" | `required`, `im_anlegen` |
| Spaltenwahl und Filter nach Gruppe geordnet | dieselbe Gruppierung in `segmentliste` und Filterbau |

Nicht übernommen wird HubSpots Bedingungslogik („Dependent properties“)
und die Berechtigung pro Eigenschaft. Beides wäre Stufe 3 aus
`PLAN-TEAM.md`.

## Stufe A — Gruppen und Systemeigenschaften (Datenmodell) ✅ 26.9.3

**Migration 0034_eigenschaftsgruppen.sql**

- Neue Tabelle `property_groups(id, org_id, entity, key, label, position,
  is_system, created_at)`, eindeutig über `(org_id, entity, key)`.
  - Zeilensicherheit per Organisation **plus FORCE**.
  - Eintrag in `datenbank.FREI` und in den Abzug (`sicherung.TABELLEN`).
- Neue Spalten an `property_definitions`:
  - `group_id` (verweist auf `property_groups`, beim Löschen der Gruppe wird der Verweis leer);
  - `is_system boolean default false`;
  - `required boolean default false`;
  - `im_anlegen boolean default false`.
- Systemeigenschaften sind **Zeilen in `property_definitions`**, deren `key`
  die Spalte ist (`name`, `city`, …).
  - Ihr Wert bleibt in der Spalte; `custom` sieht sie nie.
  - Typ, Schlüssel und Auswahlwerte kommen aus dem Code (`segmente.FELDER`)
    und sind fest.
  - Pflegbar sind Gruppe, Reihenfolge, Hilfetext, Pflicht und die Anzeige
    im Anlegen-Dialog. Ob auch die Beschriftung pflegbar ist, ist offene
    Frage 1.

**Anlegen der Vorgaben: nicht in der Migration.**
Unter FORCE kann eine Migration ohne Nutzerkontext nichts einfügen. Das ist
dieselbe Falle wie beim Nachzählen. Stattdessen legt
`eigenschaften.vorgaben_sicherstellen(conn, org, entity)` fehlende Gruppen
und Systemeigenschaften an, und zwar beim ersten Lesen, im Kontext der
handelnden Person, idempotent über `on conflict do nothing`. Kommt mit einer
neuen Version ein festes Feld dazu, erscheint es von selbst in seiner
Vorgabegruppe.

**Vorgabegruppen:**

| Objekt | Gruppen (Felder) |
|---|---|
| Firma | **Firmeninformationen** (Name, Domain, Branche, Mitarbeiter, Beschreibung) · **Adresse** (Straße, PLZ, Ort, Land) · **Kontaktwege** (Telefon, Website, LinkedIn) · **Vertrieb** (Stufe, Herkunft, Besitzer) |
| Kontakt | **Kontaktinformationen** (Vor-/Nachname, Position, Kaufrolle) · **Kontaktwege** (E-Mail, Telefon, Mobil, LinkedIn) · **Vertrieb** (Stufe, Herkunft, Besitzer, Notizen) · **Einwilligung** (Marketing-Einwilligung — nur lesbar, siehe unten) |
| Geschäft | **Geschäftsinformationen** (Name, Betrag, Abschluss, Stufe, Pipeline, Produkt) · **Qualifizierung** (die sechs Felder) · **Vertrieb** (Besitzer, Herkunft) |

Bestehende eigene Eigenschaften kommen in eine Gruppe **„Weitere
Eigenschaften"**. Nichts geht verloren, und die Einrichtung sortiert danach
um.

**Was nie pflegbar wird:**
- Gerechnete Felder (Kontakte, offene Deals, Punktzahl der
  Qualifizierung, Angelegt/Geändert) werden angezeigt und lassen sich
  gruppieren, aber nicht bearbeiten und nicht zur Pflicht machen.
- Die Marketing-Einwilligung ändert sich nur über ihren eigenen Weg
  (Double-Opt-in, Abmelden). Ein Pflichtfeld oder eine Stapeländerung darf
  sie nie setzen.

**API:**
- `GET /api/eigenschaften?entity=` liefert Gruppen mit ihren Feldern,
  feste und eigene, in Reihenfolge.
- `POST/PATCH/DELETE /api/eigenschaften/gruppen`. Eine Gruppe mit Feldern
  wird nur mit Zielgruppe gelöscht, wie bei den Pipeline-Stufen.
- `PUT /api/eigenschaften/reihenfolge` nimmt die ganze Anordnung eines
  Objekts in einem Aufruf entgegen (Gruppe → Liste der Schlüssel). So
  bleibt ein Ziehen atomar.
- Alles nur für `owner`/`admin`, protokolliert mit `audit.log_fuer`.

## Stufe B — Datensatzseite und Anlegen-Dialoge ✅ 26.9.3

- **Datensatzseite:** Die linke Spalte von Firma, Kontakt und Geschäft
  zeigt die Gruppen als Abschnitte.
  - Offen oder zu wird je Person gemerkt, in `users.einstellungen` wie die
    Favoriten.
  - Ein Schalter **„Leere Felder ausblenden"** wie in HubSpot.
  - Die festen Felder und `Eigenschaftswerteblock` gehen in einer
    Komponente auf (`components/feldgruppen.tsx`). Die fest verdrahteten
    Felder in `firmen/[id]`, `kontakte/[id]` und `deals/[id]` fallen weg.
- **Bearbeiten:** Der Bearbeiten-Schalter bleibt, weil Kai ihn so will
  (Stammdaten, 0.8.x). Er öffnet die Abschnitte als Formular. Ob Felder
  einzeln inline bearbeitet werden wie in HubSpot, ist offene Frage 2.
- **Anlegen-Dialoge:** Zu den festen Pflichtangaben kommen die Felder mit
  `im_anlegen` dazu, in Gruppenreihenfolge.

## Stufe C — Pflichtfelder und neue Feldarten

**Pflicht:**
- Beim Anlegen und beim PATCH prüft das Backend, dass kein Pflichtfeld leer
  ist oder leer gemacht wird. Die Antwort ist 422 mit Feldname und Satz.
- **Alte Datensätze werden nicht rückwirkend gesperrt.** Die Seite markiert
  fehlende Pflichtangaben („fehlt“, mit Zeichen, nicht nur mit Farbe).
- Einfuhr, Anreicherung und KI-Vorschläge sind ausgenommen: Sie legen an,
  ohne zu raten. Die Einfuhr meldet fehlende Pflichtfelder als Hinweis,
  nicht als Fehler, sonst scheitert jede Messeliste.

**Neue Arten** (an `property_kind`):

| Art | Speicherung | Prüfung / Anzeige |
|---|---|---|
| `textarea` | Text | mehrzeilig |
| `url` | Text | muss `http(s)://` sein, Anzeige als Link mit `rel="noopener"` |
| `email` | Text | Form geprüft, Anzeige als `mailto:` |
| `phone` | Text | freie Form, Anzeige als `tel:` |
| `currency` | ganze Cent | Betrag in Euro wie beim Geschäft, gerechnet wird nie im Modell |
| `user` | UUID | eine Person der Organisation, geprüft gegen `user_org_roles` |

Kein Datei-Feld: Dateien haben ihren Ort in den Dokumenten am Datensatz.
Keine Berechnungsfelder: Rechnen gehört ins Backend, nicht in eine
Formel, die jemand in den Einstellungen tippt.

## Stufe D — Listen und Filter

- Die Spaltenwahl in `segmentliste` und der Filterbau zeigen die Felder
  **nach Gruppen**, mit Suche.
- `segmente.felder()` liefert dafür die Gruppe mit. Die Reihenfolge kommt
  aus derselben Anordnung wie auf der Datensatzseite.
- Filter auf die neuen Arten:
  - `currency` und `user` wie Zahl und Besitzer;
  - `url`, `email` und `phone` wie Text.
- Die CSV-Ausfuhr ordnet die Spalten nach Gruppen. Die Einfuhr erkennt
  eigene Eigenschaften an ihrer Beschriftung. Das tut sie heute noch nicht;
  eigene Stufe, falls gewünscht.

## Die Verwaltungsseite

*Einstellungen › Eigenschaften*:

- **Bedienung:** Reiter Firma / Kontakt / Geschäft, darin die Gruppen als
  Blöcke. Ziehen ordnet Felder innerhalb und zwischen Gruppen; Gruppen
  lassen sich ebenfalls ordnen.
- **Tastatur:** Ziehen geht auch ohne Maus, mit Pfeiltasten auf dem Griff
  — dieselbe Regel wie beim Board.
- **Je Feld:** Beschriftung, Art (nach dem Anlegen fest), Hilfetext,
  Pflicht, „im Anlegen zeigen" und die Zahl der Datensätze mit Wert. Die
  Zahl rechnet die Datenbank mit Nutzerkontext.
- **Systemfelder** tragen ein Schloss mit Satz („festes Feld — verschieben
  ja, löschen nein“).
- **Archiv:** Archivierte eigene Eigenschaften stehen unten und lassen sich
  wiederherstellen. Ihre Werte bleiben in `custom`.

## Tests

- **Zeilensicherheit:** Gruppen einer Organisation sind für eine andere
  unsichtbar (`test_mandanten_sehen_einander_nicht` um die neue Tabelle
  erweitern).
- **Vorgaben:**
  - Sie entstehen genau einmal, auch bei zwei gleichzeitigen ersten
    Aufrufen.
  - Ein neues festes Feld im Code erscheint in seiner Vorgabegruppe.
- **Systemfelder:** Sie lassen sich weder löschen noch in Typ oder
  Schlüssel ändern.
- **Pflicht:**
  - Anlegen ohne Pflichtfeld: 422.
  - Leer-PATCH auf ein Pflichtfeld: 422.
  - Ein alter Datensatz ohne Wert lässt sich weiter ändern.
  - Die Einfuhr läuft durch.
- **Neue Arten:**
  - `url` ohne Schema wird abgewiesen.
  - `javascript:` wird abgewiesen.
  - `user` aus fremder Organisation wird abgewiesen.
  - `currency` rundet nie.
- **Reihenfolge:** Ein `PUT` mit fehlendem oder fremdem Schlüssel wird
  abgewiesen, nichts halb geschrieben.
- **Sicherung:** Gruppen und Anordnung überleben Abzug und Wiederanlauf.

## Reihenfolge und Umfang

| Stufe | Inhalt | Version |
|---|---|---|
| A | Gruppen, Systemeigenschaften, API, Verwaltung mit Ziehen | 26.9.3 ✅ |
| B | Datensatzseite in Abschnitten, Anlegen-Dialoge | 26.9.3 ✅ (zusammen mit A, sonst sieht man die Gruppen nirgends) |
| C | Pflichtfelder, neue Arten | nächste Version |
| D | Spaltenwahl und Filter nach Gruppen | danach |

## Entschieden (30.9.2026)

Alle drei Vorschläge wie unten angenommen.

## Offene Fragen an Kai (beantwortet)

1. **Beschriftung fester Felder:** änderbar (HubSpot erlaubt es bei
   vielen) oder fest? Vorschlag: änderbar, der Schlüssel bleibt; Einfuhr
   und KI arbeiten mit dem Schlüssel.
2. **Inline bearbeiten** wie in HubSpot (ein Klick aufs Feld) oder beim
   Bearbeiten-Schalter bleiben? Vorschlag: inline für einzelne Felder, der
   Schalter bleibt für alles auf einmal.
3. **Tickets und Aufgaben** auch mit Gruppen? Vorschlag: nein, vorerst nur
   Firma, Kontakt und Geschäft.
