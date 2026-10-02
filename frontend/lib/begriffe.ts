/**
 * Begriffe nach Modus (seit 26.10.19).
 *
 * Rocket ist ein CRM. Im Modus „Verein“ heißt dieselbe Firma Mannschaft und
 * derselbe Kontakt Person — Daten, Tabellen und Rechte bleiben gleich (siehe
 * `0040_modus.sql`). Jeder Text, der davon abhängt, kommt von hier; eine
 * Seite schreibt nie selbst „Firma“, wo im Verein „Mannschaft“ stünde.
 *
 * Grammatik zählt: „die Firma“ und „die Mannschaft“ gehen gleich, aber
 * „der Kontakt“ wird „die Person“ — deshalb stehen ganze Wendungen hier,
 * nicht nur Wörter.
 */

export type Modus = "vertrieb" | "verein";

export interface Begriffe {
  modus: Modus;
  firma: string;
  firmen: string;
  /** Dativ Plural: „mit … Firmen“. */
  firmenDativ: string;
  /** „Neue Firma“ */
  firmaNeu: string;
  /** „Über diese Firma“ */
  ueberFirma: string;
  kontakt: string;
  kontakte: string;
  /** Dativ Plural: „an … Kontakten“. */
  kontakteDativ: string;
  /** „Neuer Kontakt“ */
  kontaktNeu: string;
  /** „Über diesen Kontakt“ */
  ueberKontakt: string;
  /** „Kontakt löschen“ */
  kontaktLoeschen: string;
  /** „Firma löschen“ */
  firmaLoeschen: string;
  /** „Diesen Kontakt“ als Akkusativ-Objekt im Satz. */
  diesenKontakt: string;
  /** „Weitere Firmen“ eines Kontakts. */
  weitereFirmen: string;
  /** Rolle an der Firma („Position“ / „Rolle im Team“). */
  rolleAnFirma: string;
  firmaAnlegen: string;
  kontaktAnlegen: string;
  keineFirmaGefunden: string;
  keinKontaktGefunden: string;
  kampagnen: string;
  kampagne: string;
  kampagneAnlegen: string;
  keineKampagne: string;
  /** Gruppe von Firmen. */
  bereich: string;
  bereiche: string;
  /** Der Bereich der Einstellungen, in dem Personen und Bereiche stehen. */
  firmaUndTeam: string;
}

const VERTRIEB: Begriffe = {
  modus: "vertrieb",
  firma: "Firma",
  firmen: "Firmen",
  firmenDativ: "Firmen",
  firmaNeu: "Neue Firma",
  ueberFirma: "Über diese Firma",
  kontakt: "Kontakt",
  kontakte: "Kontakte",
  kontakteDativ: "Kontakten",
  kontaktNeu: "Neuer Kontakt",
  ueberKontakt: "Über diesen Kontakt",
  kontaktLoeschen: "Kontakt löschen",
  firmaLoeschen: "Firma löschen",
  diesenKontakt: "diesen Kontakt",
  weitereFirmen: "Weitere Firmen",
  rolleAnFirma: "Position",
  firmaAnlegen: "Firma anlegen",
  kontaktAnlegen: "Kontakt anlegen",
  keineFirmaGefunden: "Keine Firma gefunden",
  keinKontaktGefunden: "Kein Kontakt gefunden",
  kampagnen: "Kampagnen",
  kampagne: "Kampagne",
  kampagneAnlegen: "Kampagne anlegen",
  keineKampagne: "Noch keine Kampagne",
  bereich: "Bereich",
  bereiche: "Bereiche",
  firmaUndTeam: "Firma und Team",
};

const VEREIN: Begriffe = {
  modus: "verein",
  firma: "Mannschaft",
  firmen: "Mannschaften",
  firmenDativ: "Mannschaften",
  firmaNeu: "Neue Mannschaft",
  ueberFirma: "Über diese Mannschaft",
  kontakt: "Person",
  kontakte: "Personen",
  kontakteDativ: "Personen",
  kontaktNeu: "Neue Person",
  ueberKontakt: "Über diese Person",
  kontaktLoeschen: "Person löschen",
  firmaLoeschen: "Mannschaft löschen",
  diesenKontakt: "diese Person",
  weitereFirmen: "Weitere Mannschaften",
  rolleAnFirma: "Rolle im Team",
  firmaAnlegen: "Mannschaft anlegen",
  kontaktAnlegen: "Person anlegen",
  keineFirmaGefunden: "Keine Mannschaft gefunden",
  keinKontaktGefunden: "Keine Person gefunden",
  kampagnen: "Rundmails",
  kampagne: "Rundmail",
  kampagneAnlegen: "Rundmail anlegen",
  keineKampagne: "Noch keine Rundmail",
  bereich: "Bereich",
  bereiche: "Bereiche",
  firmaUndTeam: "Verein und Team",
};

export function begriffe(modus: Modus | string | undefined | null): Begriffe {
  return modus === "verein" ? VEREIN : VERTRIEB;
}

/** Was der Verein nicht braucht: Leads, Angebote, Prognose. Die Seiten
 *  bleiben erreichbar — wer zurückschaltet, hat sie wieder. */
export const NUR_VERTRIEB = ["/", "/deals", "/angebote", "/prognose"];

/** Beschriftung eines Navigationsziels nach Modus. */
export function navText(pfad: string, text: string, b: Begriffe): string {
  if (pfad === "/firmen") return b.firmen;
  if (pfad === "/kontakte") return b.kontakte;
  if (pfad === "/kampagnen") return b.kampagnen;
  return text;
}
