// Modul HB-SYMBOL — docs/MODULE.md

// Der Rumpf jedes Zeichens. Rocket zeichnet nur aus dem CI-Set
// (aimighty-ci, marke/icons/ui/), die Zeichen selbst stehen in
// lib/symbole.tsx (erzeugt). Seit 26.10.9; vorher lucide-react direkt.
//
// Zwei Regeln aus dem CI (kern/icons.md, ABGLEICH.md R2):
// - Größen nur 16 · 20 · 24, dazu 40 im Leerzustand. Der Typ lässt keine
//   andere zu.
// - Strich 1,5 px bei jeder Größe. Im 24er-Raster also 1,5 × 24 / Größe —
//   ein Zeichen, das mit der Größe dicker wird, steht neben Text zu fett.

import type { ReactNode, SVGProps } from "react";

export type Symbolgroesse = 16 | 20 | 24 | 40;

export type SymbolProps = Omit<SVGProps<SVGSVGElement>, "children" | "strokeWidth" | "width" | "height"> & {
  size?: Symbolgroesse;
};

export type SymbolKomponente = ((props: SymbolProps) => ReactNode) & { displayName?: string };

export function strich(groesse: Symbolgroesse): number {
  return (1.5 * 24) / groesse;
}

export function symbol(name: string, kinder: ReactNode): SymbolKomponente {
  function Zeichen({ size = 16, ...rest }: SymbolProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strich(size)}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-symbol={name}
        {...rest}
      >
        {kinder}
      </svg>
    );
  }
  Zeichen.displayName = `Symbol(${name})`;
  return Zeichen;
}
