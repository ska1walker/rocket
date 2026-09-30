// Modul HB-TASTATUR — docs/MODULE.md

// Tastaturwege, die mehrere Bausteine teilen — ohne React, damit sie sich
// prüfen lassen. Die Bausteine hängen sie nur an ihre Elemente.

type Taste = { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

/**
 * Alt+← / Alt+→ auf einer Karte im Brett (HB-BOARD): die Nachbarspalte,
 * oder `null`, wenn es keine gibt oder die Taste nicht gemeint ist.
 * Ohne Alt bleiben die Pfeile beim Rollen der Seite.
 */
export function nachbarspalte(t: Taste, index: number, anzahl: number): number | null {
  if (!t.altKey || t.ctrlKey || t.metaKey || t.shiftKey) return null;
  if (t.key === "ArrowRight") return index + 1 < anzahl ? index + 1 : null;
  if (t.key === "ArrowLeft") return index > 0 ? index - 1 : null;
  return null;
}

/**
 * Wohin der Fokus in einer Reihe von Reitern oder Menüpunkten geht:
 * Pfeile wandern im Kreis, Pos1/Ende springen an den Rand. `null`, wenn die
 * Taste nichts damit zu tun hat.
 */
export function naechsterPlatz(
  key: string,
  jetzt: number,
  anzahl: number,
  richtung: "waagerecht" | "senkrecht",
): number | null {
  if (anzahl === 0) return null;
  const vor = richtung === "waagerecht" ? "ArrowRight" : "ArrowDown";
  const zurueck = richtung === "waagerecht" ? "ArrowLeft" : "ArrowUp";
  if (key === vor) return (jetzt + 1) % anzahl;
  if (key === zurueck) return (jetzt - 1 + anzahl) % anzahl;
  if (key === "Home") return 0;
  if (key === "End") return anzahl - 1;
  return null;
}

/**
 * Für `role="tablist"`: Pfeile wechseln den Reiter und wählen ihn gleich
 * (wie Klicken). Gesperrte Reiter werden übersprungen.
 */
export function reiterTaste(e: { key: string; currentTarget: HTMLElement; preventDefault: () => void }): void {
  const reiter = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')];
  const jetzt = reiter.findIndex((r) => r === document.activeElement);
  if (jetzt < 0) return;
  const ziel = naechsterPlatz(e.key, jetzt, reiter.length, "waagerecht");
  if (ziel === null) return;
  e.preventDefault();
  reiter[ziel].focus();
  reiter[ziel].click();
}

/**
 * Für ein offenes Menü (`role="menu"`): ↑/↓/Pos1/Ende wandern zwischen den
 * Punkten. Gibt zurück, ob die Taste verbraucht wurde.
 */
export function menueTaste(key: string, feld: HTMLElement): boolean {
  const punkte = [...feld.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const jetzt = punkte.findIndex((p) => p === document.activeElement);
  const ziel = naechsterPlatz(key, jetzt < 0 ? -1 : jetzt, punkte.length, "senkrecht");
  if (ziel === null) return false;
  punkte[jetzt < 0 && key === "ArrowUp" ? punkte.length - 1 : ziel].focus();
  return true;
}
