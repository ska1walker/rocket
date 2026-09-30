// Alles, was die Oberfläche über die eigene Anmeldung wissen muss.
//
// Bewusst wenig: Das Passwort geht einmal über die Leitung und liegt
// danach nirgends — kein Zustandsspeicher, kein `localStorage`. Was den
// Zugang trägt, ist ein Keks, den JavaScript nicht sehen kann. Deshalb
// gibt es hier auch keine Funktion, die „das Token liest": Es gäbe nichts
// zu lesen, und eine solche Funktion wäre die Einladung, es doch wieder
// irgendwo abzulegen.

import { api } from "@/lib/api";

export const ANMELDEPFAD = "/anmelden";

export type Lage = {
  angemeldet: boolean;
  name: string | null;
  /** `olares` — der Sidecar prüft. `eigen` — diese Anmeldung prüft. */
  modus: string;
  /** Passwort stimmt, der Code aus der App steht noch aus. */
  zweiter_faktor?: boolean;
};

export type Einladung = {
  name: string;
  kennung: string;
  /** Das Konto hat schon ein Passwort — Einlösen **ersetzt** es. */
  uebernahme: boolean;
};

export function anmelden(name: string, passwort: string) {
  return api.post<Lage>("/api/anmeldung", { name, passwort });
}

/** Der zweite Schritt: Code aus der App oder ein Wiederherstellungscode. */
export function codeEinloesen(code: string) {
  return api.post<Lage>("/api/anmeldung/code", { code });
}

export function abmelden() {
  return api.post<void>("/api/abmeldung");
}

export function lage() {
  return api.get<Lage>("/api/anmeldung/lage");
}

export function passwortAendern(alt: string, neu: string) {
  return api.post<void>("/api/anmeldung/passwort", { alt, neu });
}

/** Wo der Rücksetzcode liegt. Der Code selbst kommt nie über die Leitung. */
export type Ablageort = {
  /** Der Klickweg in der Dateien-App, etwa „Data › rocket › …". */
  ordner: string;
  minuten: number;
};

export function ruecksetzungAnfordern(name: string) {
  return api.post<Ablageort>("/api/anmeldung/vergessen", { name });
}

export function ruecksetzungEinloesen(name: string, code: string, passwort: string) {
  return api.post<Lage>("/api/anmeldung/zuruecksetzen", { name, code, passwort });
}

// ── Zweiter Faktor ──────────────────────────────────────────────────────

export type FaktorStand = {
  aktiv: boolean;
  seit: string | null;
  /** Wie viele Wiederherstellungscodes noch gelten. */
  codes_uebrig: number;
  /** Verlangt die Organisation den zweiten Faktor von allen? */
  pflicht: boolean;
};

export type Einrichtung = {
  /** Zum Abtippen, falls die Kamera nicht will. */
  geheimnis: string;
  uri: string;
  /** Auf dem Server erzeugt — das Geheimnis geht an keinen Bilderdienst. */
  qr_svg: string;
};

export function faktorStand() {
  return api.get<FaktorStand>("/api/anmeldung/zweiter-faktor");
}

export function faktorEinrichten() {
  return api.post<Einrichtung>("/api/anmeldung/zweiter-faktor/einrichten");
}

/** Erst ein bestätigter Code macht das Geheimnis zum Faktor. */
export function faktorBestaetigen(code: string) {
  return api.post<{ codes: string[] }>("/api/anmeldung/zweiter-faktor/bestaetigen", { code });
}

export function codesNeu(code: string) {
  return api.post<{ codes: string[] }>("/api/anmeldung/zweiter-faktor/codes", { code });
}

export function faktorAbschalten(passwort: string, code: string) {
  return api.post<void>("/api/anmeldung/zweiter-faktor/abschalten", { passwort, code });
}

export function pflichtSetzen(an: boolean) {
  return api.put<FaktorStand>("/api/anmeldung/zweiter-faktor/pflicht", { an });
}

export function einladungLesen(token: string) {
  return api.get<Einladung>(`/api/einladung/${encodeURIComponent(token)}`);
}

export function einladungEinloesen(token: string, passwort: string) {
  return api.post<Lage>(`/api/einladung/${encodeURIComponent(token)}`, { passwort });
}

/**
 * Wohin nach dem Anmelden? Nur ein Pfad auf dieser Seite.
 *
 * Ohne diese Prüfung wäre `?weiter=` eine offene Weiterleitung: Ein Link
 * `…/anmelden?weiter=https://boese.example` führte nach erfolgreicher
 * Anmeldung auf eine fremde Seite, die aussieht wie Rocket. Erlaubt ist
 * deshalb nur ein Pfad, der mit genau einem Schrägstrich beginnt —
 * `//fremd.example` ist protokollrelativ und damit auch auswärts.
 */
export function zielPfad(weiter: string | null | undefined): string {
  if (!weiter || !weiter.startsWith("/") || weiter.startsWith("//")) return "/";
  return weiter;
}
