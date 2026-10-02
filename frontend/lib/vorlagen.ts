/**
 * Vorlagen beim Hinzufügen einer Person (seit 26.10.19).
 *
 * Rollen sind kein neues System: Eine Vorlage setzt nur, was es schon gibt
 * — Rolle, Sicht und den Haken für vertrauliche Felder. Wer eingeschränkt
 * sieht, bekommt danach den Sicht-Dialog, um Firmen oder Bereiche
 * anzuhaken (im Verein: die Mannschaft des Trainers). Die Liste hängt am
 * Modus; die Mechanik nicht.
 */

import type { Modus } from "@/lib/begriffe";

export interface Vorlage {
  schluessel: string;
  text: string;
  /** Ein Satz, was die Person damit darf. */
  hinweis: string;
  rolle: "admin" | "member" | "viewer";
  sicht: "alles" | "eingeschraenkt";
  vertraulich: boolean;
  /** Vorgabe für angehakte Firmen im Sicht-Dialog. */
  stufe: "lesen" | "bearbeiten";
}

const VERTRIEB: Vorlage[] = [
  { schluessel: "leitung", text: "Vertriebsleitung", hinweis: "verwaltet, sieht alles samt vertraulicher Felder", rolle: "admin", sicht: "alles", vertraulich: true, stufe: "bearbeiten" },
  { schluessel: "innendienst", text: "Innendienst", hinweis: "sieht und bearbeitet alles", rolle: "member", sicht: "alles", vertraulich: false, stufe: "bearbeiten" },
  { schluessel: "aussendienst", text: "Außendienst", hinweis: "sieht nur sein Gebiet — Firmen oder Bereiche wählen Sie gleich danach", rolle: "member", sicht: "eingeschraenkt", vertraulich: false, stufe: "bearbeiten" },
  { schluessel: "lesen", text: "Nur lesen", hinweis: "sieht alles, ändert nichts", rolle: "viewer", sicht: "alles", vertraulich: false, stufe: "lesen" },
];

const VEREIN: Vorlage[] = [
  { schluessel: "spartenleitung", text: "Spartenleitung", hinweis: "verwaltet, sieht alles samt Beitrag und Bank", rolle: "admin", sicht: "alles", vertraulich: true, stufe: "bearbeiten" },
  { schluessel: "vorstand", text: "Vorstand", hinweis: "sieht alles, ändert nichts", rolle: "viewer", sicht: "alles", vertraulich: false, stufe: "lesen" },
  { schluessel: "kassierer", text: "Kassierer / Geschäftsstelle", hinweis: "sieht alles samt Beitrag und Bank", rolle: "member", sicht: "alles", vertraulich: true, stufe: "bearbeiten" },
  { schluessel: "jugendleiter", text: "Jugendleiter", hinweis: "sieht einen Bereich, etwa die Jugend — gleich danach wählen", rolle: "member", sicht: "eingeschraenkt", vertraulich: false, stufe: "bearbeiten" },
  { schluessel: "trainer", text: "Trainer", hinweis: "sieht und bearbeitet seine Mannschaft — gleich danach wählen", rolle: "member", sicht: "eingeschraenkt", vertraulich: false, stufe: "bearbeiten" },
  { schluessel: "betreuer", text: "Co-Trainer / Betreuer", hinweis: "sieht seine Mannschaft, nur lesend", rolle: "member", sicht: "eingeschraenkt", vertraulich: false, stufe: "lesen" },
];

export function vorlagen(modus: Modus): Vorlage[] {
  return modus === "verein" ? VEREIN : VERTRIEB;
}

/** Ohne Vorlage: wie bisher — Mitglied, sieht alles. */
export const OHNE_VORLAGE: Vorlage = {
  schluessel: "", text: "Ohne Vorlage", hinweis: "Mitglied, sieht alles", rolle: "member", sicht: "alles", vertraulich: false, stufe: "bearbeiten",
};
