# Kurz
Vertriebs-CRM, das ganz auf Ihrer eigenen Box läuft — Firmen, Kontakte, Leads und ein AI-Assistent, der nichts nach außen meldet

# Beschreibung
**Rocket** ist ein schlankes Vertriebs-CRM für Teams, die ihre Pipeline nicht in eine US-Cloud geben können.

Firmen, Kontakte und Leads auf einem Board zum Ziehen und Ablegen, ein Verlauf an jedem Datensatz, Aufgaben, Angebote aus dem Produktkatalog, Qualifizierung mit Punktzahl und eine gewichtete Prognose — das, was ein Vertrieb wirklich braucht, ohne den Rest.

**AI, wo sie Arbeit spart**
- Eine getippte Gesprächsnotiz wird zu Notiz, Aufgaben, nächstem Schritt und Qualifizierung — vorgeschlagen vom Modell, gespeichert von einem Menschen
- Tagesbriefing, Fragen an den eigenen Bestand mit Quellen, Angebotsvorschläge mit Preisen aus dem Katalog, nie aus dem Modell
- Assistent: Sagen Sie Rocket in einem Satz, was zu tun ist — er sucht, öffnet Seiten und schlägt Aufgaben, Notizen, Kontakte und Leadwechsel als Karten vor; geschrieben wird erst, wenn Sie bestätigen
- Erkenntnisse: Gesprächsnotizen werden einmal gelesen, in Kundenaussagen mit wörtlichem Zitat zerlegt und zu Themen gebündelt — jedes mit seiner Bedeutung für das Produkt und den Gesprächen dahinter
- Beschreiben statt Tippen: „Baustoffhandel im Raum Tecklenburg, der Geschäftsführer heißt wohl Sebastian“ — Rocket findet passende Firmen aus Suchtreffern, liest Impressum und Teamseite der gewählten und schlägt Firma und Person mit einer Quelle je Feld vor; eine Person zählt nur, wenn eine gelesene Quelle den Nachnamen nennt
- Neue Firmen und Kontakte werden aus der Website ergänzt und, wenn ein Suchdienst eingerichtet ist, aus Suchtreffern bis hin zu LinkedIn-Seiten — jeder Wert nennt seine Quelle, Kontaktdaten müssen wörtlich dastehen, vorhandene Werte werden nie überschrieben

**Sprachmodell**
Rocket kommt ohne eingerichteten Endpunkt. Tragen Sie unter Einstellungen eine OpenAI-kompatible Adresse ein — zum Beispiel die LiteLLM-App auf derselben Box. Einen Vorgabewert gibt es bewusst nicht: Nichts verlässt die Box, bevor Sie eine Adresse eintragen, und die App sagt das klar.

**Anbindungen**
Besprechungsprotokolle aus Insilo kommen über dessen gemeinsamen Ordner auf derselben Box oder per signiertem Webhook; Post geht über Ihr eigenes SMTP-Konto hinaus. Nach jeder Änderung, spätestens alle sechs Stunden, entsteht eine Sicherung, die nach einer Neuinstallation von selbst zurückgespielt wird.

Keine Telemetrie. Kein Nach-Hause-Telefonieren. Die Schriften liefert die Box selbst.

**Ressourcen**
CPU: 0,2 Kerne angefordert, bis zu 2
RAM: 1 GB angefordert, bis zu 2
Speicher: 1 GB (Datenbankanteil, Sicherungen)
GPU: keine — das Sprachmodell läuft extern
