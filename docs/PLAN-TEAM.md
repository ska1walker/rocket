# Plan: Rocket für Vertriebsteams

> **Stand:** 29. September 2026 · **Status:** Plan, nicht umgesetzt
> **Entschieden von Kai am 29.9.2026:** ein Weg über IMAP/SMTP für alle
> Anbieter · zweiter Faktor zuerst, Anmeldung über Microsoft/Google danach ·
> Mails am Kontakt sieht das Team, privat markierbar · eingelesen wird nur,
> was einen bekannten Kontakt betrifft.

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
4. **Keine Anmeldung mit dem Firmenkonto** (Microsoft 365, Google Workspace).

## Stufe 1 — Anmeldung härten

Klein, ohne Registrierung bei Microsoft oder Google, für jeden Kunden nutzbar.

- **Zweiter Faktor per App (TOTP).** `users.totp_geheimnis` steht seit 0026
  bereit, verschlüsselt im Tresor. Einrichten mit QR-Code und einem
  bestätigten ersten Code; zehn Wiederherstellungscodes, nur als Hash
  gespeichert. Bei der Anmeldung nach dem Passwort, mit derselben Bremse
  wie das Passwort.
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

**Verbinden** unter *Einstellungen › Mein Postfach*, je Person:

| Anbieter | Anmeldung | Protokoll |
|---|---|---|
| Microsoft 365 | „Mit Microsoft verbinden" (OAuth, `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`) | IMAP/SMTP mit XOAUTH2 |
| Google Workspace | „Mit Google verbinden" (OAuth, `https://mail.google.com/`) | IMAP/SMTP mit XOAUTH2 |
| alles andere | Server, Benutzer, Passwort | IMAP/SMTP |

Ein Abholer, ein Versender — nur die Anmeldung unterscheidet sich. Tokens
und Passwörter liegen verschlüsselt im Tresor; Refresh-Tokens werden
erneuert, bevor sie ablaufen, ein widerrufenes Token meldet die
Oberfläche, statt still nichts mehr zu lesen.

**Einlesen**, alle 1–2 Minuten je Postfach, Posteingang und Gesendet:

- Nur Mails, bei denen Absender oder ein Empfänger **schon als Kontakt**
  in Rocket steht. Alles andere wird nicht gespeichert — nur die UID
  weitergezählt. Private Post landet nie in der Datenbank.
- Unbekannter Absender von einer bekannten Firmendomain: kein Einlesen,
  aber ein Vorschlag „Kontakt anlegen?" (ohne Mailinhalt).
- Die Mail wird eine Aktivität am Kontakt (und an seinem offenen Geschäft),
  der Faden über `Message-ID`/`In-Reply-To`.
- Anhänge: Name und Größe, der Inhalt erst auf Klick aus dem Postfach.

**Senden** aus Rocket geht über das eigene Postfach der Person. Die Mail
liegt danach in ihrem „Gesendet", die Antwort in ihrem Posteingang — und
kommt von dort über den Abholer ins CRM. Der `Reply-To`-Umweg entfällt
für verbundene Postfächer. Das Postfach der Organisation bleibt für
Tickets und für Personen ohne eigenes Postfach.

**Sichtbarkeit:** Eine Mail am Kontakt sieht das Team (Betreff und Text).
Jede Person kann eine Mail oder eine Adresse als **privat** markieren;
dann sieht das Team nur „private Mail, Datum", den Text nur der
Postfach-Inhaber. Durchgesetzt in der Zeilensicherheit, nicht nur in der
Oberfläche.

**Schema** (Migration, RLS mit FORCE):

- `mailkonten` — je Person: Anbieter, Adresse, Server, Zugangsdaten
  (Tresor), letzte UID je Ordner, letzter Lauf, letzter Fehler. Im
  Datenbank-Blick **gesperrt**, im Abzug mit verschlüsselten Werten.
- `mails` erweitert: `mailkonto_id`, `richtung` (ein/aus), `privat`,
  `von`, `empfangen_am`.
- `mail_privat_adressen` — Adressen, die eine Person immer privat hält.

**Voraussetzungen auf Kundenseite:** eine App-Registrierung bei Microsoft
(Entra ID) bzw. Google (Cloud-Projekt, OAuth-Zustimmung) — einmal je
Rocket-Installation, Anleitung in BETRIEB.md. Rückkehradresse ist der
öffentliche Eingang (`https://<appid>0.<nutzer>.<zone>/api/oauth/…`), den
es seit 0.6.9 gibt. Die Box braucht Zugang nach außen zu
`login.microsoftonline.com`, `outlook.office365.com`,
`accounts.google.com`, `imap.gmail.com`.

Tests: nur Kontakte werden eingelesen, keine Markierung wird gesetzt,
private Mail ist für andere nur als Hinweis sichtbar, fremde Organisation
sieht nichts, abgelaufenes Token wird erneuert, widerrufenes gemeldet.

## Stufe 3 — Anmelden mit dem Firmenkonto (SSO)

Setzt auf der App-Registrierung aus Stufe 2 auf: dieselbe Freigabe meldet
an und verbindet das Postfach.

- „Mit Microsoft anmelden" und „Mit Google anmelden" (OIDC), später
  allgemeines OIDC für Firmen mit eigenem Anbieter (z. B. Authentik).
- **Nur mit Einladung**: Das Firmenkonto wird über die verifizierte
  Adresse einer eingeladenen Person zugeordnet, nie neu angelegt.
- Der Eigentümer legt die erlaubten Domains fest und kann die
  Passwort-Anmeldung für alle außer sich selbst abschalten (Notzugang).
- Zweiter Faktor kommt dann vom Anbieter; Rocket verlangt keinen zweiten
  eigenen.

## Stufe 4 — Feinere Rechte

Wenn Teams wachsen: Sichtbarkeit von Firmen, Kontakten und Geschäften
nach Besitzer oder Team („sieht nur die eigenen Kunden"), als Richtlinie
in der Zeilensicherheit. Erst angehen, wenn ein Kunde es braucht.

## Reihenfolge und grober Umfang

| Stufe | Inhalt | Umfang |
|---|---|---|
| 1 | zweiter Faktor, Reset per Mail, Geräte abmelden, Protokoll, Sitzplatz weg | klein |
| 2a | Postfach verbinden per IMAP/Passwort, Einlesen nur Kontakte, Senden aus eigenem Konto | mittel |
| 2b | OAuth für Microsoft und Google (XOAUTH2), Token-Erneuerung | mittel |
| 2c | privat markieren, Sichtbarkeit in der Zeilensicherheit | klein |
| 3 | SSO mit Microsoft/Google, Domains, Notzugang | mittel |
| 4 | Rechte nach Besitzer/Team | nach Bedarf |

2a vor 2b: Der IMAP-Weg mit Passwort beweist Abholer, Zuordnung und
Sichtbarkeit, ohne auf eine App-Registrierung zu warten.

## Bewusst nicht

- **Kein Mailprogramm.** Rocket zeigt nicht den ganzen Posteingang,
  sondern nur, was zu Kunden gehört.
- **Kein Aggregator** wie Nylas: Die Mails liefen über eine fremde Cloud.
- **Kein eigener Anmeldedienst** (Keycloak, Authentik) als Pflicht — er
  bleibt eine Option über allgemeines OIDC.
- **Kein Push** über Graph oder Gmail-API; Abfrage alle 1–2 Minuten reicht
  für ein CRM und braucht keine Cloud-Einrichtung.
