"use client";

// Modul HB-DARSTELLUNG — docs/MODULE.md

/**
 * Hell / Dunkel / Wie das System — und die Dichte (Weit / Normal / Kompakt).
 *
 * Der Dunkelmodus des AImighty-Systems ist kein Farbfilter, sondern eine
 * eigene Rollenverteilung: im Hellmodus handelt Hanseatenblau und Gold
 * zeichnet aus, im Dunkelmodus handelt Gold — „Blau auf Blau trägt nicht"
 * ist die dokumentierte Ausnahme. Beides steckt in den Token; hier wird
 * nur die Klasse `dunkel` am <html> gesetzt.
 *
 * Ein Cookie, keine Server-Persistenz: Die Wahl ist gerätebezogen sinnvoll
 * — am Schreibtisch hell, abends am Telefon dunkel — und hat im
 * Benutzerkonto nichts verloren.
 */

import { DichteKompakt, DichteNormal, DichteWeit, Monitor, Moon, Sun } from "@/lib/symbole";
import { useEffect, useState } from "react";

export const DARSTELLUNG_COOKIE = "rocket-darstellung";

export type Darstellung = "hell" | "dunkel" | "system";

/**
 * Läuft als Inline-Script vor dem ersten Anstrich (siehe layout.tsx).
 * Ohne das blitzt bei dunkler Einstellung kurz die helle Fläche auf.
 * Bewusst als String und ohne Abhängigkeiten — er läuft, bevor React da ist.
 */
export const DARSTELLUNG_SCRIPT = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)rocket-darstellung=([^;]*)/);
    var wahl = m ? m[1] : "system";
    var dunkel =
      wahl === "dunkel" ||
      (wahl !== "hell" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dunkel) document.documentElement.classList.add("dunkel");
  } catch (e) {}
})();
`;

function setzeCookie(wert: Darstellung) {
  const ablauf = new Date();
  ablauf.setTime(ablauf.getTime() + 365 * 86400 * 1000);
  document.cookie = `${DARSTELLUNG_COOKIE}=${wert}; Path=/; Expires=${ablauf.toUTCString()}; SameSite=Lax`;
}

function liesCookie(): Darstellung {
  if (typeof document === "undefined") return "system";
  const m = document.cookie.match(/(?:^|;\s*)rocket-darstellung=([^;]*)/);
  const wert = m?.[1];
  return wert === "hell" || wert === "dunkel" ? wert : "system";
}

function wende(wahl: Darstellung) {
  const dunkel =
    wahl === "dunkel" ||
    (wahl === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dunkel", dunkel);
}

const WAHLEN: { wert: Darstellung; text: string; Zeichen: typeof Sun }[] = [
  { wert: "system", text: "System", Zeichen: Monitor },
  { wert: "hell", text: "Hell", Zeichen: Sun },
  { wert: "dunkel", text: "Dunkel", Zeichen: Moon },
];

export function Darstellungsschalter() {
  // Vor der Hydration nichts markieren: Der Server kennt den Cookie nicht
  // und würde sonst eine andere Auswahl rendern als der Browser.
  const [wahl, setWahl] = useState<Darstellung | null>(null);

  useEffect(() => {
    const gespeichert = liesCookie();
    setWahl(gespeichert);
    wende(gespeichert);

    // Steht die Wahl auf „System", muss ein Wechsel der Systemeinstellung
    // sofort durchschlagen — ohne Neuladen.
    const medium = window.matchMedia("(prefers-color-scheme: dark)");
    const beiWechsel = () => {
      if (liesCookie() === "system") wende("system");
    };
    medium.addEventListener("change", beiWechsel);
    return () => medium.removeEventListener("change", beiWechsel);
  }, []);

  return (
    <div className="darstellung-schalter" role="group" aria-label="Darstellung">
      {WAHLEN.map(({ wert, text, Zeichen }) => (
        <button
          key={wert}
          type="button"
          className={`darstellung-knopf${wahl === wert ? " aktiv" : ""}`}
          aria-pressed={wahl === wert}
          title={text}
          onClick={() => {
            setWahl(wert);
            setzeCookie(wert);
            wende(wert);
          }}
        >
          <Zeichen size={16} aria-hidden="true" />
          <span className="nur-vorleser">{text}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Dichte ─────────────────────────────────────────────────────────────
 * Die drei Stufen aus tokens/app.css im CI: Weit ist die Vorgabe am Zeiger
 * (--am-skalierung 1,1, kein Attribut), Normal setzt data-dichte="normal"
 * (1,0), Kompakt data-dichte="kompakt" (0,9). Dichte ändert nur Maße —
 * Schrift, Farbe und Kontrast bleiben (medien/app.md im CI).
 *
 * Am Touchscreen gibt es die Wahl nicht, und das Skript setzt dort nichts:
 * Die Ziele stehen ohnehin auf 44 px, eine dichtere Stufe nähme nur den
 * Abstand zwischen ihnen. Wie die Darstellung ein Cookie je Gerät — am
 * Schreibtisch dicht, am Laptop unterwegs weit. */

export const DICHTE_COOKIE = "rocket-dichte";

export type Dichte = "weit" | "normal" | "kompakt";

/** Läuft vor dem ersten Anstrich (layout.tsx), sonst springt die Seite. */
export const DICHTE_SCRIPT = `
(function () {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    var m = document.cookie.match(/(?:^|;\\s*)rocket-dichte=([^;]*)/);
    if (m && (m[1] === "normal" || m[1] === "kompakt"))
      document.documentElement.setAttribute("data-dichte", m[1]);
  } catch (e) {}
})();
`;

function liesDichte(): Dichte {
  if (typeof document === "undefined") return "weit";
  const wert = document.cookie.match(/(?:^|;\s*)rocket-dichte=([^;]*)/)?.[1];
  return wert === "normal" || wert === "kompakt" ? wert : "weit";
}

function setzeDichte(wert: Dichte) {
  const ablauf = new Date();
  ablauf.setTime(ablauf.getTime() + 365 * 86400 * 1000);
  document.cookie = `${DICHTE_COOKIE}=${wert}; Path=/; Expires=${ablauf.toUTCString()}; SameSite=Lax`;
  if (wert === "weit") document.documentElement.removeAttribute("data-dichte");
  else document.documentElement.setAttribute("data-dichte", wert);
}

const DICHTEN: { wert: Dichte; text: string; Zeichen: typeof Sun }[] = [
  { wert: "weit", text: "Weit", Zeichen: DichteWeit },
  { wert: "normal", text: "Normal", Zeichen: DichteNormal },
  { wert: "kompakt", text: "Kompakt", Zeichen: DichteKompakt },
];

export function Dichteschalter() {
  // null bis nach der Hydration — und am Touchscreen für immer.
  const [wahl, setWahl] = useState<Dichte | null>(null);
  const [zeiger, setZeiger] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    setZeiger(true);
    setWahl(liesDichte());
  }, []);

  if (!zeiger) return null;

  return (
    <div className="darstellung-schalter" role="group" aria-label="Dichte">
      {DICHTEN.map(({ wert, text, Zeichen }) => (
        <button
          key={wert}
          type="button"
          className={`darstellung-knopf${wahl === wert ? " aktiv" : ""}`}
          aria-pressed={wahl === wert}
          title={text}
          onClick={() => {
            setWahl(wert);
            setzeDichte(wert);
          }}
        >
          <Zeichen size={16} aria-hidden="true" />
          <span className="nur-vorleser">{text}</span>
        </button>
      ))}
    </div>
  );
}
