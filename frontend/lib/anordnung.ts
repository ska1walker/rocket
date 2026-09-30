// Felder zwischen Gruppen verschieben — ohne React, damit es sich prüfen lässt.
//
// Die Oberfläche hält die Anordnung als Liste von Gruppen mit ihren Feldern
// und schickt nach jedem Ziehen die ganze Anordnung an
// `PUT /api/eigenschaften/reihenfolge`. Diese Funktionen geben immer eine
// neue Anordnung zurück und lassen die alte unberührt — TanStack Query
// vergleicht nach Referenz.

import type { Anordnung, Eigenschaftsgruppe } from "@/lib/typen";

export type Ort = { gruppe: string; index: number };

/** Wo steht ein Feld gerade? */
export function finde(a: Anordnung, feldId: string): Ort | null {
  for (const g of a.gruppen) {
    const i = g.felder.findIndex((f) => f.id === feldId);
    if (i >= 0) return { gruppe: g.id, index: i };
  }
  return null;
}

/**
 * Setzt ein Feld an eine Stelle — in derselben oder einer anderen Gruppe.
 * `index` zählt in der Zielgruppe **ohne** das verschobene Feld; ein Wert
 * über dem Ende hängt hinten an.
 */
export function verschiebe(a: Anordnung, feldId: string, ziel: Ort): Anordnung {
  const von = finde(a, feldId);
  if (!von) return a;
  const feld = a.gruppen.find((g) => g.id === von.gruppe)!.felder[von.index];
  const ohne = a.gruppen.map((g) =>
    g.id === von.gruppe ? { ...g, felder: g.felder.filter((f) => f.id !== feldId) } : g,
  );
  return {
    ...a,
    gruppen: ohne.map((g) => {
      if (g.id !== ziel.gruppe) return g;
      const felder = [...g.felder];
      felder.splice(Math.max(0, Math.min(ziel.index, felder.length)), 0, feld);
      return { ...g, felder };
    }),
  };
}

/**
 * Beim Ziehen zeigt die Maus auf ein Feld: „vor dieses". Gezählt ist das
 * mit dem gezogenen Feld noch an seinem alten Platz. Liegt der alte Platz
 * in derselben Gruppe davor, rückt alles um eins auf — sonst landete das
 * Feld eine Stelle zu weit hinten.
 */
export function ablageOrt(a: Anordnung, feldId: string, ziel: Ort): Ort {
  const von = finde(a, feldId);
  if (von && von.gruppe === ziel.gruppe && von.index < ziel.index) {
    return { gruppe: ziel.gruppe, index: ziel.index - 1 };
  }
  return ziel;
}

/**
 * Einen Schritt hoch oder runter — über Gruppengrenzen hinweg. Am Anfang
 * einer Gruppe geht es ans Ende der vorigen, am Ende an den Anfang der
 * nächsten. So erreicht die Tastatur jede Stelle, die die Maus erreicht.
 */
export function schritt(a: Anordnung, feldId: string, richtung: -1 | 1): Anordnung {
  const von = finde(a, feldId);
  if (!von) return a;
  const gi = a.gruppen.findIndex((g) => g.id === von.gruppe);
  const gruppe = a.gruppen[gi];
  const neu = von.index + richtung;
  if (neu >= 0 && neu < gruppe.felder.length) {
    return verschiebe(a, feldId, { gruppe: gruppe.id, index: neu });
  }
  const nachbar = a.gruppen[gi + richtung];
  if (!nachbar) return a;
  return verschiebe(a, feldId, {
    gruppe: nachbar.id,
    index: richtung === -1 ? nachbar.felder.length : 0,
  });
}

/** Eine Gruppe einen Platz weiter. */
export function gruppeSchieben(a: Anordnung, gruppeId: string, richtung: -1 | 1): Anordnung {
  const i = a.gruppen.findIndex((g) => g.id === gruppeId);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= a.gruppen.length) return a;
  const gruppen: Eigenschaftsgruppe[] = [...a.gruppen];
  [gruppen[i], gruppen[j]] = [gruppen[j], gruppen[i]];
  return { ...a, gruppen };
}

/** Die Form, die `PUT /api/eigenschaften/reihenfolge` erwartet. */
export function alsReihenfolge(a: Anordnung) {
  return {
    entity: a.entity,
    gruppen: a.gruppen.map((g) => ({ id: g.id, felder: g.felder.map((f) => f.id) })),
  };
}

/** Passt ein Feld auf die Suche? Beschriftung oder Schlüssel. */
export function passt(suche: string, label: string, key: string): boolean {
  const s = suche.trim().toLowerCase();
  return !s || label.toLowerCase().includes(s) || key.toLowerCase().includes(s);
}

/**
 * Felder nach ihrer Gruppe, in der Reihenfolge, in der sie kommen — für
 * Spaltenwahl und Filterbau. Felder ohne Gruppe (Tickets, Aufgaben, oder
 * bevor jemand die Eigenschaften geöffnet hat) bilden eine Gruppe `null`.
 */
export function gruppieren<T extends { gruppe?: string | null }>(felder: T[]): { gruppe: string | null; felder: T[] }[] {
  const ergebnis: { gruppe: string | null; felder: T[] }[] = [];
  for (const f of felder) {
    const g = f.gruppe ?? null;
    const letzte = ergebnis.find((e) => e.gruppe === g);
    if (letzte) letzte.felder.push(f);
    else ergebnis.push({ gruppe: g, felder: [f] });
  }
  return ergebnis;
}
