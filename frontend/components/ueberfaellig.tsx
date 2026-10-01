// Modul HB-ZUSTAND — docs/MODULE.md

import { Clock } from "@/lib/symbole";

/**
 * Eine Frist oder ein Datum, das überschritten sein kann.
 *
 * Rot ist in der Anwendung für Handlungsbedarf erlaubt, aber nie allein
 * (ABGLEICH.md im CI, R7): Ist die Frist überschritten, stehen Uhr und ein
 * Wort dabei — „seit 3 Tagen überfällig“, nicht nur ein rotes Datum. Wer
 * Rot nicht sieht, liest es trotzdem.
 */
export function Ueberfaellig({
  ueberfaellig,
  className = "frist",
  children,
}: {
  ueberfaellig: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={className} data-ueberfaellig={ueberfaellig ? "true" : undefined}>
      {ueberfaellig && <Clock size={16} aria-hidden="true" className="ueberfaellig-zeichen" />}
      {children}
    </span>
  );
}
