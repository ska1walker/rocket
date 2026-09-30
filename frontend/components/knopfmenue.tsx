"use client";

// Modul HB-KNOPFMENUE — docs/MODULE.md

// Ein Knopf, der mehr als eine Sache kann.
//
// Gedacht für den Fall, dass eine Seite **einen** offensichtlichen
// Hauptweg hat und einen zweiten, den man selten braucht und trotzdem
// finden muss: Kontakt anlegen — oder eben hundert auf einmal aus einer
// Datei. Der Import lag zuerst nur in den Einstellungen; dort sucht ihn
// niemand, der gerade auf die leere Kontaktliste schaut.
//
// Der erste Eintrag ist die Vorgabe: Ein Klick auf den Knopf selbst führt
// ihn aus, ohne das Menü zu öffnen. Wer nur anlegen will, merkt vom Menü
// nichts.

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { menueTaste } from "@/lib/tasten";

export type Menuepunkt = {
  text: string;
  hinweis?: string;
  onWahl: () => void;
};

/**
 * Was ein aufklappendes Menü mit der Tastatur können muss: Beim Öffnen
 * steht der Fokus auf dem ersten Punkt, ↑/↓/Pos1/Ende wandern, Escape
 * schließt und gibt den Fokus dem Knopf zurück, Tab schließt und geht
 * weiter. Ein Klick daneben schließt. Geteilt mit „Erstellen" in der
 * Kopfleiste.
 */
export function useMenue() {
  const [offen, setOffen] = useState(false);
  const wurzel = useRef<HTMLDivElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const feld = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    feld.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function maus(e: MouseEvent) {
      if (!wurzel.current?.contains(e.target as Node)) setOffen(false);
    }
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOffen(false);
        knopf.current?.focus();
      } else if (e.key === "Tab") {
        setOffen(false);
      } else if (feld.current && menueTaste(e.key, feld.current)) {
        e.preventDefault();
      }
    }
    document.addEventListener("mousedown", maus);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", maus);
      document.removeEventListener("keydown", taste);
    };
  }, [offen]);

  return { offen, setOffen, wurzel, knopf, feld };
}

export function Knopfmenue({
  text,
  eintraege,
}: {
  text: string;
  eintraege: Menuepunkt[];
}) {
  const { offen, setOffen, wurzel, knopf, feld } = useMenue();
  const id = useId();

  return (
    <div className="knopfmenue" ref={wurzel}>
      <button
        type="button"
        className="btn btn-primaer knopfmenue-haupt"
        onClick={() => eintraege[0]?.onWahl()}
      >
        {text}
      </button>
      <button
        type="button"
        className="btn btn-primaer knopfmenue-pfeil"
        ref={knopf}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={id}
        aria-label={`${text} — weitere Wege`}
        onClick={() => setOffen((o) => !o)}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {offen && (
        <div className="knopfmenue-feld" id={id} role="menu" ref={feld}>
          {eintraege.map((e) => (
            <button
              key={e.text}
              type="button"
              role="menuitem"
              className="knopfmenue-punkt"
              onClick={() => {
                setOffen(false);
                e.onWahl();
              }}
            >
              <span>{e.text}</span>
              {e.hinweis && <span className="knopfmenue-hinweis">{e.hinweis}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
