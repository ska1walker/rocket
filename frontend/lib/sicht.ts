"use client";

import { useWer } from "@/lib/wer";
import { begriffe, type Begriffe } from "@/lib/begriffe";

/**
 * Was die angemeldete Person sehen und tun darf — für die Oberfläche.
 *
 * Geschützt wird im Backend (Zeilensicherheit und Erlaubnisliste); hier
 * geht es nur darum, nichts anzubieten, was der Server danach abweist.
 * Solange `wer` lädt, gilt alles als zu: lieber einen Knopf einen Moment
 * später zeigen als einen, der gleich wieder verschwindet.
 */
export function useSicht() {
  const { wer } = useWer();
  const w = wer.data;
  const eingeschraenkt = w?.sicht === "eingeschraenkt";
  return {
    geladen: !!w,
    eingeschraenkt,
    /** Volle Sicht (auch für Leser): Bestand, Leads, Auswertungen. */
    alles: !!w && !eingeschraenkt,
    /** Eigentümerin oder Verwalter mit voller Sicht. */
    verwaltet: !!w && !eingeschraenkt && (w.rolle === "owner" || w.rolle === "admin"),
    /** Rolle `viewer`: liest nur. */
    liest: w?.rolle === "viewer",
    /** Sieht vertrauliche Feldgruppen (seit 26.10.18). */
    vertraulich: !!w?.vertraulich,
  };
}

/** Einen Satz aus Namen bauen: „A“, „A und B“, „A, B und C“. */
export function aufzaehlung(namen: string[]): string {
  if (namen.length <= 1) return namen.join("");
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/**
 * Die Sicht einer Person in Klartext — steht im Dialog unter der Auswahl,
 * damit niemand aus Häkchen ablesen muss, was am Ende gilt.
 */
export function sichtSatz(
  name: string,
  sicht: "alles" | "eingeschraenkt",
  zugriffe: { name: string; bereich: boolean; stufe: "lesen" | "bearbeiten" }[],
  vertraulich?: boolean,
  w: Begriffe = begriffe("vertrieb"),
): string {
  const satz = sichtSatzOhne(name, sicht, zugriffe, w);
  if (vertraulich === undefined) return satz;
  return `${satz} Vertrauliche Felder ${vertraulich ? "auch" : "nicht"}.`;
}

function sichtSatzOhne(
  name: string,
  sicht: "alles" | "eingeschraenkt",
  zugriffe: { name: string; bereich: boolean; stufe: "lesen" | "bearbeiten" }[],
  w: Begriffe,
): string {
  if (sicht === "alles") return `${name} sieht alle ${w.firmen} und ${w.kontakte}.`;
  if (zugriffe.length === 0) return `${name} sieht keine ${w.kontakte}, nur die Namen der ${w.firmen}.`;
  const titel = (z: { name: string; bereich: boolean }) => (z.bereich ? `Bereich ${z.name}` : z.name);
  const alle = zugriffe.map(titel);
  const nurLesen = zugriffe.filter((z) => z.stufe === "lesen").map(titel);
  const satz = `${name} sieht die ${w.kontakte} von ${aufzaehlung(alle)}`;
  if (nurLesen.length === 0) return `${satz} und kann sie bearbeiten.`;
  if (nurLesen.length === alle.length) return `${satz}, nur lesend.`;
  return `${satz}; nur lesend bei ${aufzaehlung(nurLesen)}.`;
}
