import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Jeder Abschnitt von globals.css trägt eine Kennung aus docs/MODULE.md.
 *
 * Aus Rockets Stylesheet schneidet das CI-Repo die Referenz seiner Bausteine
 * (werkzeug/bauteile.py, ABGLEICH.md Paket 3; Kai, 1.10.2026). Das geht nur,
 * wenn jede Kopfzeile `/* ── Titel [KENNUNG] ─…` sagt, wem die Regeln
 * darunter gehören. Ein Kopf ohne Kennung hängte seine Regeln still an den
 * Baustein davor. Innerhalb des Token-Blocks (AM-TOKEN) gliedern Köpfe ohne
 * Kennung nur die Werte.
 */

const FRONTEND = join(__dirname, "..", "..");
const css = readFileSync(join(FRONTEND, "app", "globals.css"), "utf8");
const module = readFileSync(join(FRONTEND, "..", "docs", "MODULE.md"), "utf8");

const KOPF = /^\s*\/\* ── /;
const KENNUNG = /\[((?:AM|HB|RK)-[A-Z]+)\]/;

function koepfe() {
  const zeilen = css.split("\n");
  const ende = zeilen.findIndex((z) => z.includes("[AM-BASIS]"));
  return zeilen
    .map((z, i) => ({ z, nr: i + 1 }))
    .filter(({ z, nr }) => nr > ende && KOPF.test(z));
}

describe("Abschnitte in globals.css", () => {
  it("der Token-Block endet mit einem Abschnitt [AM-BASIS]", () => {
    expect(css).toContain("[AM-BASIS]");
  });

  it("jeder Kopf nach dem Token-Block trägt eine Kennung", () => {
    const ohne = koepfe().filter(({ z }) => !KENNUNG.test(z)).map(({ nr, z }) => `${nr}: ${z.trim()}`);
    expect(ohne).toEqual([]);
  });

  it("jede Kennung steht in docs/MODULE.md", () => {
    const kennungen = new Set(koepfe().map(({ z }) => z.match(KENNUNG)?.[1]).filter(Boolean) as string[]);
    const fehlt = [...kennungen].filter((k) => !new RegExp(`\\| ${k} \\|`).test(module));
    expect(fehlt).toEqual([]);
  });
});
