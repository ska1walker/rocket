// Werte eines Feldes — anzeigen, in eine Eingabe verwandeln und zurück.
//
// Ohne React, damit es sich prüfen lässt. Dieselben Regeln gelten für die
// festen Felder (Spalten am Datensatz) und die eigenen (`custom`); nur
// `patchFuer` weiß, wohin ein Wert gehört.

import { datum, euroGenau } from "@/lib/format";
import type { Eigenschaftsoption, Feldeintrag } from "@/lib/typen";

export type Auswahl = { wert: string; text: string };

export function istLeer(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Welche Optionen zur Wahl stehen: archivierte nur, wenn schon gesetzt. */
export function waehlbar(optionen: Eigenschaftsoption[], gesetzt: unknown): Auswahl[] {
  const drin = new Set(Array.isArray(gesetzt) ? gesetzt.map(String) : istLeer(gesetzt) ? [] : [String(gesetzt)]);
  return optionen
    .filter((o) => !o.verborgen || drin.has(o.wert))
    .map((o) => ({ wert: o.wert, text: o.verborgen ? `${o.text} (archiviert)` : o.text }));
}

/** Nur Adressen, die ein Browser gefahrlos öffnet. `javascript:` nie. */
export function sichereUrl(v: string): string | null {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  // „example.de" ohne Schema: so steht es oft in Domain und Website.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) return `https://${s}`;
  return null;
}

/** Der Wert als Text, wie ein Mensch ihn liest. */
export function anzeige(feld: Feldeintrag, v: unknown, personen: Auswahl[] = [], optionen?: Auswahl[]): string {
  if (istLeer(v)) return "—";
  const text = (w: string) =>
    (optionen ?? feld.options).find((o) => o.wert === w)?.text ?? w;
  switch (feld.art) {
    case "select":
    case "company":
      return text(String(v));
    case "multiselect":
      return (Array.isArray(v) ? v : [v]).map((w) => text(String(w))).join(", ");
    case "bool":
      return v === true || v === "true" ? "Ja" : "Nein";
    case "date":
      return datum(String(v));
    case "currency":
      return euroGenau(Number(v));
    case "number":
      return Number(v).toLocaleString("de-DE");
    case "user":
      return personen.find((p) => p.wert === String(v))?.text ?? "unbekannt";
    default:
      return String(v);
  }
}

/** Der gespeicherte Wert als Inhalt eines Eingabefeldes. */
export function alsEingabe(feld: Feldeintrag, v: unknown): string | string[] {
  if (feld.art === "multiselect") return Array.isArray(v) ? v.map(String) : istLeer(v) ? [] : [String(v)];
  if (istLeer(v)) return "";
  if (feld.art === "currency") return (Number(v) / 100).toFixed(2).replace(".", ",");
  if (feld.art === "date") return String(v).slice(0, 10);
  if (feld.art === "bool") return v === true || v === "true" ? "true" : "false";
  return String(v);
}

export class Eingabefehler extends Error {}

/**
 * Eine Eingabe als Wert für die API. Leer heißt `null` — so löscht ein
 * PATCH. Beträge kommen in Euro (Komma oder Punkt) und gehen in Cent;
 * gerundet wird auf den Cent, nie weiter.
 */
export function ausEingabe(feld: Feldeintrag, roh: string | string[]): unknown {
  if (Array.isArray(roh)) return roh.length ? roh : null;
  const s = roh.trim();
  if (s === "") return null;
  switch (feld.art) {
    case "number": {
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) throw new Eingabefehler(`„${feld.label}“ erwartet eine Zahl.`);
      return n;
    }
    case "currency": {
      const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[€\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new Eingabefehler(`„${feld.label}“ erwartet einen Betrag.`);
      return Math.round(n * 100);
    }
    case "bool":
      return s === "true";
    default:
      return s;
  }
}

/** Wohin ein Wert im PATCH gehört: feste Felder oben, eigene in `custom`. */
export function patchFuer(werte: { feld: Feldeintrag; wert: unknown }[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const { feld, wert } of werte) {
    if (feld.is_system) patch[feld.key] = wert;
    else custom[feld.key] = wert;
  }
  if (Object.keys(custom).length) patch.custom = custom;
  return patch;
}

/** Der Wert eines Feldes am Datensatz — Spalte oder `custom`. */
export function wertVon(feld: Feldeintrag, datensatz: Record<string, unknown>): unknown {
  if (feld.is_system) return datensatz[feld.key];
  const custom = (datensatz.custom ?? {}) as Record<string, unknown>;
  return custom[feld.key];
}
