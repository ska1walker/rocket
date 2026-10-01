import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * React #418, selten und nur unter Last: Laufen Symbole über die Metadaten von
 * Next (Dateien app/icon.*, app/apple-icon.*, oder `icons` in `metadata`),
 * rendert Next eine Marke <meta name="«nxt-icon»">, die es aus dem Datenstrom
 * nur entfernt, wenn sie in einem Stück liegt. Fällt eine Stückgrenze hinein,
 * bleibt sie stehen und der Browser meldet #418 (BETRIEB.md, „#418“).
 * Rocket bindet die Symbole deshalb selbst im <head> ein (app/layout.tsx).
 */

const APP = join(__dirname, "..", "..", "app");

describe("keine Symbole über die Metadaten von Next", () => {
  it("app/ hat keine Symbol-Dateien nach Konvention", () => {
    const konvention = readdirSync(APP).filter((n) => /^(icon|apple-icon|favicon)\d*\.(svg|png|ico|jpg|jpeg|tsx?|jsx?)$/.test(n));
    expect(konvention).toEqual([]);
  });

  it("metadata nennt keine icons, der <head> verlinkt sie selbst", () => {
    const layout = readFileSync(join(APP, "layout.tsx"), "utf8");
    const metadata = layout.slice(layout.indexOf("export const metadata"), layout.indexOf("export const viewport"));
    expect(metadata).not.toMatch(/\bicons\s*:/);
    expect(layout).toContain('rel="icon" href="/icon.svg"');
    expect(layout).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });
});
