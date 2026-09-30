"use client";

// Modul HB-BOARD — docs/MODULE.md

// Das Brett mit der Tastatur: Alt+← / Alt+→ schiebt die fokussierte Karte
// in die Nachbarspalte, wie das Ziehen mit der Maus. Danach steht der Fokus
// wieder auf derselben Karte in ihrer neuen Spalte, und ein Vorleser hört,
// wohin sie ging. Vorher ließ sich keine Karte ohne Maus bewegen.

import { useEffect, useState } from "react";
import { nachbarspalte } from "@/lib/tasten";

export const BRETT_HINWEIS_ID = "brett-hinweis";

/**
 * `daten` ist, was das Brett zeichnet — ändert es sich, sucht der Hook die
 * zuletzt verschobene Karte und gibt ihr den Fokus zurück.
 */
export function useBrettTastatur<T>(daten: T) {
  // Karte und Zielspalte: Gefokusst wird erst, wenn die Karte dort steht —
  // bis das Brett neu geladen ist, steht sie noch in der alten Spalte.
  const [fokus, setFokus] = useState<{ id: string; spalte: number } | null>(null);
  const [ansage, setAnsage] = useState("");

  useEffect(() => {
    if (!fokus) return;
    const karte = document.querySelector<HTMLElement>(`[data-karte="${CSS.escape(fokus.id)}"]`);
    const spalten = [...document.querySelectorAll(".board-spalte")];
    if (karte && spalten.indexOf(karte.closest(".board-spalte")!) === fokus.spalte) {
      karte.focus();
      setFokus(null);
    }
  }, [fokus, daten]);

  /**
   * Für `onKeyDown` an der Karte. `schieben` bekommt den Index der
   * Zielspalte; zurück kommt der Name, der angesagt wird.
   */
  function taste(
    e: React.KeyboardEvent,
    kartenId: string,
    spalte: number,
    spalten: number,
    schieben: (ziel: number) => string,
  ) {
    const ziel = nachbarspalte(e, spalte, spalten);
    if (ziel === null) return;
    e.preventDefault();
    const name = schieben(ziel);
    setFokus({ id: kartenId, spalte: ziel });
    setAnsage(`Nach „${name}" verschoben.`);
  }

  return { taste, ansage };
}

/** Einmal je Brett: der Hinweis, auf den jede Karte verweist, und die Ansage. */
export function BrettHinweis({ ansage }: { ansage: string }) {
  return (
    <>
      <p id={BRETT_HINWEIS_ID} className="nur-vorleser">
        Mit Alt und Pfeil nach links oder rechts in die Nachbarspalte schieben.
      </p>
      <p className="nur-vorleser" aria-live="polite">
        {ansage}
      </p>
    </>
  );
}
