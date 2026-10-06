// Die Bereiche der Einstellungen — für die Seite (Unternavigation) und die
// Suche in der Kopfleiste (seit 26.10.22: Die Einstellungen stehen nicht mehr
// in der Navigation, also findet man sie über das Profil oder die Suche).

import { Cpu, Database, Inbox, KeyRound, Mail, Monitor, Settings, SlidersHorizontal, TrendingUp, Users } from "@/lib/symbole";
import type { Begriffe } from "@/lib/begriffe";

/**
 * Die Einstellungen in zwei Gruppen (Kai, 6.10.2026; wie Linear und HubSpot):
 * „Mein Konto“ für alles, was nur die eigene Person betrifft, und
 * „Organisation“ für den gemeinsamen Bestand. Erreichbar nur über das
 * Profil oben rechts (seit 26.10.22): „Mein Konto“ und, für wer verwaltet,
 * „Einstellungen der Organisation“; dazu über die Suche.
 *
 * Eine Seite mit vierzehn Blöcken untereinander liest niemand. Jeder
 * Unterpunkt trägt, was zusammengehört; jeder Block sagt in einem Satz,
 * wozu er da ist, und hält das Kleingedruckte hinter dem Symbol.
 */
export const BEREICHE = [
  { schluessel: "profil", text: "Profil", beschreibung: "Name, Anmeldename, Rolle und was Sie sehen", symbol: Settings },
  { schluessel: "sicherheit", text: "Sicherheit", beschreibung: "Passwort, zweiter Faktor, angemeldete Geräte", symbol: KeyRound },
  { schluessel: "postfach", text: "Mein Postfach", beschreibung: "Ihr Postfach und Ihre Absenderadresse", symbol: Inbox },
  { schluessel: "darstellung", text: "Darstellung", beschreibung: "Hell oder dunkel, Dichte", symbol: Monitor },
  { schluessel: "firma", text: "Firma und Team", beschreibung: "Firmendaten, Team, Bereiche", symbol: Users },
  { schluessel: "vertrieb", text: "Vertrieb", beschreibung: "Pipelines und Stufen, Produktkatalog, Verlustgründe", symbol: TrendingUp },
  { schluessel: "eigenschaften", text: "Eigenschaften", beschreibung: "Felder und Gruppen für Firmen, Kontakte und Leads", symbol: SlidersHorizontal },
  { schluessel: "email", text: "E-Mail", beschreibung: "Konto der Organisation, Marketing, Postfach, Relay", symbol: Mail },
  { schluessel: "ki", text: "AI und Programme", beschreibung: "Sprachmodell, Sprachausgabe, Ergänzen, Insilo, Programme, API-Schlüssel", symbol: Cpu },
  { schluessel: "daten", text: "Daten", beschreibung: "Sicherung, Import und Export, Datenbank, Datenwege", symbol: Database },
] as const;

export type Bereich = (typeof BEREICHE)[number]["schluessel"];

/** Was nur die eigene Person betrifft — das sieht jede, auch wer eingeschränkt ist. */
export const MEIN_KONTO: Bereich[] = ["profil", "sicherheit", "postfach", "darstellung"];

export const GRUPPEN: { titel: string; schluessel: Bereich[] }[] = [
  { titel: "Mein Konto", schluessel: MEIN_KONTO },
  { titel: "Organisation", schluessel: ["firma", "vertrieb", "eigenschaften", "email", "ki", "daten"] },
];

/** Was ein Bereich nach Modus heißt und ob es ihn gibt (seit 26.10.19):
 *  Im Verein fehlt „Vertrieb“ (Pipelines, Katalog, Verlustgründe). */
export function bereicheFuer(w: Begriffe) {
  return BEREICHE
    .filter((b) => w.modus !== "verein" || b.schluessel !== "vertrieb")
    .map((b) => {
      if (b.schluessel === "firma") {
        return { ...b, text: w.firmaUndTeam, beschreibung: w.modus === "verein" ? "Modus, Team, Bereiche" : "Modus, Firmendaten, Team, Bereiche" };
      }
      if (b.schluessel === "eigenschaften") {
        return { ...b, beschreibung: `Felder und Gruppen für ${w.firmen}, ${w.kontakte}${w.modus === "verein" ? "" : " und Leads"}` };
      }
      return b;
    });
}

/**
 * Bereiche der Einstellungen, die zum Suchtext passen — nach Name und
 * Beschreibung, ohne Groß- und Kleinschreibung. Wer eingeschränkt sieht,
 * findet nur „Mein Konto“; die Organisation nur, wer sie verwaltet.
 */
export function einstellungenFinden(text: string, w: Begriffe, verwaltet: boolean): { titel: string; untertitel: string; pfad: string }[] {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return [];
  const alle = t.length >= 4 && "einstellungen".startsWith(t);
  return bereicheFuer(w)
    .filter((b) => verwaltet || MEIN_KONTO.includes(b.schluessel))
    .filter((b) => alle || b.text.toLowerCase().includes(t) || b.beschreibung.toLowerCase().includes(t))
    .slice(0, 4)
    .map((b) => ({ titel: b.text, untertitel: b.beschreibung, pfad: `/einstellungen?bereich=${b.schluessel}` }));
}
