// Modul RK-PRODUKT — docs/MODULE.md

// Die Produktleiter Assistent / Analyst / Experte trägt die Rollenzeichen aus
// dem CI-Set (marke/icons/ui/rolle-*.svg), wie auf der Website — damit man die
// Stufe überall am selben Zeichen erkennt (ABGLEICH.md, R2). Leistung,
// Sonstiges und eigene Katalogeinträge haben kein Zeichen: Dort stünde sonst
// ein erfundenes neben drei festen.

import { RolleAnalyst, RolleAssistent, RolleExperte } from "@/lib/symbole";
import type { SymbolKomponente } from "@/components/symbol";

const ROLLE: Record<string, SymbolKomponente> = {
  assistent: RolleAssistent,
  analyst: RolleAnalyst,
  experte: RolleExperte,
};

/** Das Rollenzeichen zu einem Produktschlüssel, oder nichts. */
export function Produktzeichen({ produkt }: { produkt: string }) {
  const Zeichen = ROLLE[produkt];
  return Zeichen ? <Zeichen size={16} aria-hidden="true" className="produktzeichen" /> : null;
}

/**
 * Name mit Rollenzeichen davor, in einer Zeile. Ohne Rolle bleibt der Platz
 * frei, damit die Namen in einer Tabelle untereinander stehen.
 */
export function MitProduktzeichen({ produkt, children }: { produkt: string; children: React.ReactNode }) {
  return (
    <span className="mit-produktzeichen">
      {ROLLE[produkt] ? <Produktzeichen produkt={produkt} /> : <span className="produktzeichen-platz" aria-hidden="true" />}
      {children}
    </span>
  );
}
