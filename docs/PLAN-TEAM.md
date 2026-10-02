# Plan: Rocket für Vertriebsteams

> **Stand:** 30. September 2026 · **Status:** Stufe 1 umgesetzt (26.9.2), Stufen 2 und 3 geplant
> **Entschieden von Kai am 29.9.2026:**
> - Anmeldung an Rocket **nur mit Rocket-Passwort und zweitem Faktor** —
>   keine Anmeldung über Microsoft oder Google (kein SSO).
> - Postfächer über **einen Weg: IMAP/SMTP**. Microsoft, Google und
>   gängige Anbieter stehen als **Voreinstellung** zur Wahl, damit Server
>   und Ports vorausgefüllt sind.
> - Einzige Ausnahme: **Microsoft 365** lässt IMAP nicht mehr mit Passwort
>   zu, dort gibt die Person ihr Postfach einmal per OAuth frei — nur für
>   Mail, nicht als Anmeldung an Rocket.
> - Mails am Kontakt sieht das Team, privat markierbar.
> - Eingelesen wird nur, was einen bekannten Kontakt betrifft.

## Ausgangslage

Rocket meldet seit 0.6.0 selbst an (Passwort, Einladung, Rollen,
Geräteübersicht, Bremse nach Fehlversuchen) und schickt seit 0.6.5 unter
dem Namen der Person, wahlweise mit eigenen SMTP-Zugangsdaten. Olares
selbst kann einem Team keinen gemeinsamen Bestand geben (eine App je
Nutzer; die *shared app* hat keinen Eingang, BETRIEB.md „Anmeldung"), die
Anmeldung bleibt also in Rocket.

Was fehlt, damit echte Vertriebsteams damit arbeiten:

1. **Kein zweiter Faktor**, Passwort-Rückweg nur per Datei auf der Box.
2. **Der Sitzplatz** steht noch in der Oberfläche, obwohl er bei eigener
   Anmeldung nichts mehr tut.
3. **Empfangen geht nur über ein Postfach je Organisation.** Antworten
   werden per `Reply-To` dorthin umgeleitet — die Person sieht sie nicht
   dort, wo sie Post liest, und Mails aus dem eigenen Programm fehlen im
   CRM ganz.

## Stufe 1 — Anmeldung härten ✅ umgesetzt in 26.9.2

Wie es gebaut ist, steht in `docs/BETRIEB.md` unter „Zweiter Faktor",
„Wenn niemand mehr hereinkommt" und „Der Sitzplatz ist weg". Abweichungen
vom Plan: „Alle Geräte abmelden" gab es schon („Andere abmelden"); die
Zuschreibung im Modus `olares` läuft ohne Sitzplatz, jede weitere Person
meldet sich über ihre Einladung selbst an.

Klein, ohne jede Einrichtung bei Microsoft oder Google, für jeden Kunden
nutzbar. Das ist die Anmeldung an Rocket, und sie bleibt es.

- **Zweiter Faktor per App (TOTP)** — Authenticator-App, 1Password,
  Bitwarden o. Ä. `users.totp_geheimnis` steht seit 0026 bereit,
  verschlüsselt im Tresor. Einrichten mit QR-Code und einem bestätigten
  ersten Code; zehn Wiederherstellungscodes, nur als Hash gespeichert.
  Abgefragt nach dem Passwort, mit derselben Bremse wie das Passwort.
- **Pflicht für alle**, als Schalter für den Eigentümer. Wer noch keinen
  zweiten Faktor hat, landet nach der Anmeldung in der Einrichtung.
- **Passwort zurücksetzen per Mail**, wenn SMTP eingerichtet ist; der Weg
  über die Datei auf der Box bleibt als Rückfall.
- **„Alle Geräte abmelden"** als Knopf in der Geräteübersicht.
- **Anmeldungen ins Protokoll** (Erfolg, Fehlversuch, zweiter Faktor,
  Abmeldung).
- **Sitzplatz entfernen** — Oberfläche, Kopf `X-Rocket-Sitzplatz`,
  `_sitzplatz_einnehmen`. Im Modus `olares` bleibt die Zuschreibung über
  den Olares-Namen.

Tests: Anmeldung ohne Code scheitert, falscher Code bremst, ein
Wiederherstellungscode gilt genau einmal, Pflicht greift.

## Stufe 2 — Das persönliche Postfach

Der größte Nutzen. Baut auf `app/postfach.py` auf (liest schon heute als
zweiter Klient, fasst keine Markierung an, merkt sich die UID).

### Verbinden

Unter *Einstellungen › Mein Postfach* wählt jede Person ihren Anbieter.
Die Voreinstellung füllt Server, Ports und Verschlüsselung aus; alles
bleibt änderbar, und „Anderer Anbieter" lässt die Felder leer.

| Anbieter | IMAP (Empfang) | SMTP (Versand) | Anmeldung am Postfach |
|---|---|---|---|
| Google / Gmail | `imap.gmail.com:993` SSL | `smtp.gmail.com:465` SSL | **App-Passwort** (Bestätigung in zwei Schritten muss an sein; der Workspace-Admin darf App-Passwörter nicht gesperrt haben) |
| Microsoft 365 / Outlook | `outlook.office365.com:993` SSL | `smtp.office365.com:587` STARTTLS | **„Mit Microsoft verbinden"** (OAuth, XOAUTH2) — siehe unten |
| IONOS | `imap.ionos.de:993` SSL | `smtp.ionos.de:587` STARTTLS | Passwort |
| Strato | `imap.strato.de:993` SSL | `smtp.strato.de:465` SSL | Passwort |
| one.com | `imap.one.com:993` SSL | `send.one.com:465` SSL | Passwort |
| Anderer Anbieter | frei | frei | Passwort |

Die Liste steht als Daten im Code (`app/mailanbieter.py`), nicht in der
Datenbank — eine neue Voreinstellung ist eine Zeile. Die Werte werden vor
der Umsetzung gegen die Hilfeseiten der Anbieter geprüft. Nach dem
Speichern: Verbindung testen (IMAP anmelden, SMTP anmelden), das Ergebnis
steht im Block, wie beim „Testmail an mich" heute.

**Warum Microsoft 365 anders ist.** Microsoft hat die Anmeldung mit
Passwort für IMAP in Exchange Online abgeschaltet. SMTP mit Passwort geht
noch bis Ende Dezember 2026 und ist danach standardmäßig aus, das
endgültige Ende soll 2027 angekündigt werden. Ein Microsoft-365-Postfach
lässt sich also nur per OAuth lesen. Das ist **keine Anmeldung an
Rocket**: Die Person meldet sich weiter mit Rocket-Passwort und zweitem
Faktor an und gibt nur beim Verbinden einmal ihr Postfach frei.
Angefragt werden ausschließlich die Mail-Rechte
(`https://outlook.office.com/IMAP.AccessAsUser.All`,
`https://outlook.office.com/SMTP.Send`, `offline_access`) — kein `openid`,
kein Profil, nichts, womit Rocket eine Identität übernehmen könnte.
Voraussetzung ist eine App-Registrierung in Microsoft Entra ID je
Rocket-Installation (Client-ID und Geheimnis im Tresor, Anleitung in
BETRIEB.md); Rückkehradresse ist der öffentliche Eingang
(`https://<appid>0.<nutzer>.<zone>/api/mailkonten/microsoft/zurueck`),
den es seit 0.6.9 gibt.

Zugangsdaten — Passwort, App-Passwort, Refresh-Token — liegen
verschlüsselt im Tresor. Ein Refresh-Token wird erneuert, bevor es
abläuft; ein widerrufenes oder abgelaufenes meldet die Oberfläche, statt
still nichts mehr zu lesen.

### Einlesen

Alle 1–2 Minuten je Postfach, Posteingang und Gesendet:

- Nur Mails, bei denen Absender oder ein Empfänger **schon als Kontakt**
  in Rocket steht. Alles andere wird nicht gespeichert — nur die UID
  weitergezählt. Private Post landet nie in der Datenbank.
- Unbekannter Absender von einer bekannten Firmendomain: kein Einlesen,
  aber ein Vorschlag „Kontakt anlegen?" (ohne Mailinhalt).
- Die Mail wird eine Aktivität am Kontakt (und an seinem offenen Geschäft),
  der Faden über `Message-ID`/`In-Reply-To`.
- Anhänge: Name und Größe, der Inhalt erst auf Klick aus dem Postfach.
- Keine Markierung wird angefasst — kein `\Seen`, kein Verschieben.

### Senden

Aus Rocket geht über das eigene Postfach der Person. Die Mail liegt
danach in ihrem „Gesendet" (bei Anbietern, die das nicht selbst tun, legt
Rocket sie per IMAP `APPEND` dort ab), die Antwort in ihrem Posteingang —
und kommt von dort über den Abholer ins CRM. Der `Reply-To`-Umweg entfällt
für verbundene Postfächer. Das Postfach der Organisation bleibt für
Tickets und für Personen ohne eigenes Postfach.

### Sichtbarkeit

Eine Mail am Kontakt sieht das Team (Betreff und Text). Jede Person kann
eine Mail oder eine Adresse als **privat** markieren; dann sieht das Team
nur „private Mail, Datum", den Text nur der Postfach-Inhaber. Durchgesetzt
in der Zeilensicherheit, nicht nur in der Oberfläche.

### Schema

Migration mit RLS und FORCE:

- `mailkonten` — je Person: Anbieter (Schlüssel der Voreinstellung oder
  `eigen`), Adresse, IMAP-/SMTP-Server und Ports, Art der Anmeldung
  (`passwort` | `microsoft`), Zugangsdaten (Tresor), letzte UID je Ordner,
  letzter Lauf, letzter Fehler. Im Datenbank-Blick **gesperrt**, im Abzug
  mit verschlüsselten Werten.
- `mails` erweitert: `mailkonto_id`, `richtung` (ein/aus), `privat`,
  `von`, `empfangen_am`.
- `mail_privat_adressen` — Adressen, die eine Person immer privat hält.

Die Box braucht Zugang nach außen zu den Mailservern der Anbieter, bei
Microsoft zusätzlich zu `login.microsoftonline.com`.

### Tests

Nur Kontakte werden eingelesen, keine Markierung wird gesetzt, private
Mail ist für andere nur als Hinweis sichtbar, fremde Organisation sieht
nichts, eine Voreinstellung füllt die richtigen Ports, ein abgelaufenes
Microsoft-Token wird erneuert, ein widerrufenes gemeldet, die
Microsoft-Freigabe fragt keine Anmelderechte an (`openid` fehlt).

## Stufe 3 — Feinere Rechte (begonnen 2.10.2026)

Wenn Teams wachsen: Sichtbarkeit von Firmen, Kontakten und Geschäften
nach Zuordnung („sieht nur die eigenen Kunden"), als Richtlinie in der
Zeilensicherheit. Angestoßen von Kai für den Verein (Spartenleitung sieht
alles, der Trainer seine Mannschaft), gebaut als CRM-Funktion.

Fünf Schritte, je ein Release:

1. ✅ **Fundament (26.10.15):** Sicht je Person, Zugriff auf Firma oder
   Bereich (lesen/bearbeiten), Beziehungen zwischen Kontakten, Regeln in
   der Datenbank, `viewer` liest nur, Lücken bei Sicherung und
   Import-Verlauf zu. `docs/BETRIEB.md`, „Sicht nach Zuordnung“.
2. ✅ **Dicht für den Alltag (26.10.16):** Erlaubnisliste der Pfade für Eingeschränkte,
   gespeicherte AI-Ergebnisse heraus, neutrale Dubletten-Meldung, Empfänger
   beim Start festschreiben, Leck-Test über jede Route.
3. ✅ **Oberfläche (26.10.17):** Vorlagen beim Einladen, Zugriffe anhaken, Bereiche,
   „Wer sieht diese Firma“, Eltern am Kind, Rundgang als Trainer.
4. **Vertrauliche Feldgruppen:** Werte in eigener Tabelle, nur mit
   Schalter „sieht vertrauliche Felder“.
5. **Modus Vertrieb/Verein:** nur Begriffe und Navigation, keine Rechte.

## Reihenfolge und grober Umfang

| Stufe | Inhalt | Umfang |
|---|---|---|
| 1 | zweiter Faktor, Reset per Mail, Geräte abmelden, Protokoll, Sitzplatz weg | klein |
| 2a | Postfach verbinden mit Voreinstellungen und (App-)Passwort, Einlesen nur Kontakte, Senden aus eigenem Konto | mittel |
| 2b | privat markieren, Sichtbarkeit in der Zeilensicherheit | klein |
| 2c | Microsoft 365 per OAuth-Freigabe (XOAUTH2), Token-Erneuerung | mittel |
| 3 | Rechte nach Besitzer/Team | nach Bedarf |

2a zuerst: Google mit App-Passwort und jeder gewöhnliche Mailserver
beweisen Abholer, Zuordnung und Sichtbarkeit, ohne auf eine
App-Registrierung bei Microsoft zu warten. 2c, sobald der erste Kunde mit
Microsoft 365 kommt.

## Bewusst nicht

- **Keine Anmeldung an Rocket über Microsoft oder Google** (kein SSO, kein
  „Mit Google anmelden"). Die Anmeldung bleibt Rocket-Passwort plus
  zweiter Faktor.
- **Kein OAuth für Google** — dort reicht das App-Passwort.
- **Kein Mailprogramm.** Rocket zeigt nicht den ganzen Posteingang,
  sondern nur, was zu Kunden gehört.
- **Kein Aggregator** wie Nylas: Die Mails liefen über eine fremde Cloud.
- **Kein Push** über Graph oder Gmail-API; Abfrage alle 1–2 Minuten reicht
  für ein CRM.

## Quellen zur Lage bei Microsoft und Google (geprüft 29.9.2026)

- Microsoft: [Deprecation of Basic authentication in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)
- Microsoft: [Updated Exchange Online SMTP AUTH Basic Authentication Deprecation Timeline](https://techcommunity.microsoft.com/blog/exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835)
- Google: [Transition from less secure apps to OAuth](https://support.google.com/a/answer/14114704?hl=en)
