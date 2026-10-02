/**
 * Die Navigation als Daten — ohne React, damit sie sich prüfen lässt.
 *
 * Die Leiste zeigt, was jemand sich gemerkt hat — in der Reihenfolge der
 * Lesezeichen; solange niemand etwas gemerkt hat, sechs Vorgaben. Alles andere
 * steht hinter „Mehr“: die vier Gruppen Verkauf, Bestand, Post, Wissen
 * nebeneinander, je Eintrag ein Lesezeichen. So macht es HubSpot, und bei
 * fünfzehn Zielen braucht es dafür kein Untermenü je Gruppe. Die Symbole
 * hängen in der Hülle an den Schlüsseln; hier steht nur, was wohin gehört.
 */

export type NavZeichen =
  | "start" | "leads" | "angebote" | "prognose" | "aufgaben"
  | "firmen" | "kontakte" | "listen"
  | "eingang" | "besprechungen" | "tickets" | "kampagnen"
  | "fragen" | "erkenntnisse" | "einstellungen";

export interface NavZiel {
  pfad: string;
  text: string;
  zeichen: NavZeichen;
}

export interface NavGruppe {
  titel: string;
  ziele: NavZiel[];
}

export const GRUPPEN: NavGruppe[] = [
  {
    titel: "Verkauf",
    ziele: [
      { pfad: "/", text: "Start", zeichen: "start" },
      { pfad: "/deals", text: "Leads", zeichen: "leads" },
      { pfad: "/angebote", text: "Angebote", zeichen: "angebote" },
      { pfad: "/prognose", text: "Prognose", zeichen: "prognose" },
      { pfad: "/aufgaben", text: "Aufgaben", zeichen: "aufgaben" },
    ],
  },
  {
    titel: "Bestand",
    ziele: [
      { pfad: "/firmen", text: "Firmen", zeichen: "firmen" },
      { pfad: "/kontakte", text: "Kontakte", zeichen: "kontakte" },
      { pfad: "/listen", text: "Listen", zeichen: "listen" },
    ],
  },
  {
    titel: "Post",
    ziele: [
      { pfad: "/eingang", text: "Eingang", zeichen: "eingang" },
      // Gespräche aus Insilo. Nicht im Eingang: Der ist eine Warteschlange,
      // die leer werden soll — Besprechungen sind ein Archiv.
      { pfad: "/besprechungen", text: "Besprechungen", zeichen: "besprechungen" },
      { pfad: "/tickets", text: "Tickets", zeichen: "tickets" },
      { pfad: "/kampagnen", text: "Kampagnen", zeichen: "kampagnen" },
    ],
  },
  {
    titel: "Wissen",
    ziele: [
      { pfad: "/fragen", text: "Fragen", zeichen: "fragen" },
      { pfad: "/erkenntnisse", text: "Erkenntnisse", zeichen: "erkenntnisse" },
    ],
  },
];

export const NACHRANGIG: NavZiel[] = [{ pfad: "/einstellungen", text: "Einstellungen", zeichen: "einstellungen" }];

export const ALLE_ZIELE: NavZiel[] = GRUPPEN.flatMap((g) => g.ziele);

/** Was die Leiste zeigt, solange niemand Favoriten hat. */
export const LEISTE_STANDARD = ["/", "/deals", "/aufgaben", "/firmen", "/kontakte", "/eingang"];

/** Was die schmale Leiste unten zeigt, wenn niemand Favoriten hat. */
export const MOBIL_STANDARD = ["/", "/deals", "/firmen", "/kontakte"];
export const MOBIL_MAX = 4;

/**
 * Was eine Person mit eingeschränkter Sicht erreicht (seit 26.10.17).
 *
 * Dasselbe wie `auth.EINGESCHRAENKT_ERLAUBT` im Backend, nur in Seiten
 * gedacht: Der Server sagt bei allem anderen 403, die Navigation zeigt es
 * gar nicht erst. Start, Leads, Prognose, Eingang und die übrigen rechnen
 * über den ganzen Bestand — sie stehen hier nicht.
 */
export const EINGESCHRAENKT_OFFEN = ["/kontakte", "/firmen", "/aufgaben", "/listen", "/kampagnen", "/fragen", "/einstellungen"];

/** Die Leiste einer eingeschränkten Person, solange sie nichts gemerkt hat. */
export const LEISTE_EINGESCHRAENKT = ["/kontakte", "/firmen", "/aufgaben", "/listen"];

/** Steht diese Seite einer eingeschränkten Person offen? Unterseiten zählen mit. */
export function offenFuerEingeschraenkt(aktuell: string): boolean {
  return EINGESCHRAENKT_OFFEN.some((pfad) => aktuell === pfad || aktuell.startsWith(`${pfad}/`));
}

function nurOffene(ziele: NavZiel[], eingeschraenkt: boolean): NavZiel[] {
  return eingeschraenkt ? ziele.filter((z) => EINGESCHRAENKT_OFFEN.includes(z.pfad)) : ziele;
}

/** Die Gruppen von „Mehr“ — für Eingeschränkte ohne Verschlossenes und ohne leere Gruppe. */
export function gruppenFuer(eingeschraenkt = false): NavGruppe[] {
  return GRUPPEN.map((g) => ({ ...g, ziele: nurOffene(g.ziele, eingeschraenkt) })).filter((g) => g.ziele.length > 0);
}

export function istAktiv(pfad: string, aktuell: string): boolean {
  if (pfad === "/") return aktuell === "/";
  return aktuell === pfad || aktuell.startsWith(`${pfad}/`);
}

const JE_PFAD = new Map([...ALLE_ZIELE, ...NACHRANGIG].map((z) => [z.pfad, z]));

/** Die Favoriten als Ziele — in gemerkter Reihenfolge; Unbekanntes und Doppeltes fällt weg. */
export function favoritenZiele(favoriten: string[]): NavZiel[] {
  const ergebnis: NavZiel[] = [];
  for (const pfad of favoriten) {
    const ziel = JE_PFAD.get(pfad);
    if (ziel && !ergebnis.includes(ziel)) ergebnis.push(ziel);
  }
  return ergebnis;
}

/**
 * Die Leiste links: die Favoriten — oder, solange es keine gibt, die
 * Vorgabe. Das erste Lesezeichen ersetzt die Vorgabe ganz: Wer wählt, will
 * seine Auswahl sehen, nicht seine Auswahl plus unsere.
 */
export function leisteZiele(favoriten: string[], eingeschraenkt = false): NavZiel[] {
  const meine = nurOffene(favoritenZiele(favoriten), eingeschraenkt);
  if (meine.length > 0) return meine;
  return favoritenZiele(eingeschraenkt ? LEISTE_EINGESCHRAENKT : LEISTE_STANDARD);
}

export function favoritUmschalten(favoriten: string[], pfad: string): string[] {
  return favoriten.includes(pfad) ? favoriten.filter((p) => p !== pfad) : [...favoriten, pfad];
}

/** Die Leiste unten: erst die Favoriten, aufgefüllt aus der Vorgabe bis vier. */
export function mobilZiele(favoriten: string[], eingeschraenkt = false): NavZiel[] {
  const ziele = nurOffene(favoritenZiele(favoriten), eingeschraenkt).slice(0, MOBIL_MAX);
  for (const z of favoritenZiele(eingeschraenkt ? LEISTE_EINGESCHRAENKT : MOBIL_STANDARD)) {
    if (ziele.length >= MOBIL_MAX) break;
    if (!ziele.includes(z)) ziele.push(z);
  }
  return ziele;
}

/** Alles, was nicht auf der Leiste ist — für „Mehr“, inklusive Einstellungen. */
export function mobilRest(favoriten: string[], eingeschraenkt = false): NavZiel[] {
  const gezeigt = new Set(mobilZiele(favoriten, eingeschraenkt).map((z) => z.pfad));
  return nurOffene([...ALLE_ZIELE, ...NACHRANGIG], eingeschraenkt).filter((z) => !gezeigt.has(z.pfad));
}
