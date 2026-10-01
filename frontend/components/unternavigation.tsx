// Modul HB-UNTERNAV — docs/MODULE.md

/**
 * Die zweite Navigationsebene einer Seite mit mehreren Bereichen —
 * Einstellungen in Rocket, später ebenso in Relay.
 *
 * Am Desktop eine senkrechte, mitlaufende Liste in Gruppen links neben dem
 * Inhalt (wie HubSpot, Stripe, GitHub). Auf dem Handy wird dieselbe Liste
 * zur Übersicht, aus der man in einen Bereich wechselt — wie die
 * Einstellungen des iPhone; ist ein Bereich gewählt, steht nur dieser da
 * und der Seitenkopf führt zurück. Welche Ansicht gilt, entscheidet CSS an
 * `data-auswahl` der umgebenden `.unternav-seite`, nicht JavaScript: So
 * rendern Server und Browser dasselbe.
 */

import type { SymbolKomponente } from "@/components/symbol";
import { ChevronRight } from "@/lib/symbole";
import Link from "next/link";
import { useId } from "react";

export type UnternavEintrag = {
  schluessel: string;
  text: string;
  /** Ein Satz für die Übersicht auf dem Handy. */
  beschreibung: string;
  href: string;
  symbol: SymbolKomponente;
};

export type UnternavGruppe = { titel: string; eintraege: UnternavEintrag[] };

export function Unternavigation({
  gruppen,
  aktiv,
  label,
}: {
  gruppen: UnternavGruppe[];
  /** Schlüssel des gewählten Eintrags; `null` heißt: noch keiner gewählt. */
  aktiv: string | null;
  label: string;
}) {
  const kennung = useId();
  return (
    <nav className="unternav" aria-label={label}>
      {gruppen.map((g, i) => (
        <div key={g.titel} className="unternav-gruppe" role="group" aria-labelledby={`${kennung}-${i}`}>
          <p className="unternav-titel" id={`${kennung}-${i}`}>
            {g.titel}
          </p>
          <ul>
            {g.eintraege.map((e) => {
              const Symbol = e.symbol;
              const ist = e.schluessel === aktiv;
              return (
                <li key={e.schluessel}>
                  <Link
                    href={e.href}
                    className={`unternav-eintrag${ist ? " aktiv" : ""}`}
                    aria-current={ist ? "page" : undefined}
                  >
                    <Symbol size={20} aria-hidden="true" className="unternav-symbol" />
                    <span className="unternav-text">
                      <span className="unternav-name">{e.text}</span>
                      <span className="unternav-beschreibung">{e.beschreibung}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className="unternav-pfeil" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
