import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * „AI“, nicht „KI“ — in allem, was ein Mensch in Rocket liest.
 *
 * Entschieden von Kai am 1.10.2026 im Abgleich mit dem CI (ABGLEICH.md, R3;
 * `kern/wording.md`): Das Kürzel heißt überall AI. Ausgeschrieben steht es
 * deutsch, wenn ein Text etwas erklärt. Der Test liest Oberfläche und
 * Backend-Meldungen ohne Kommentare und meldet jedes übrig gebliebene „KI“.
 * Bezeichner wie `ki-knopf` oder `routers/ki.py` sind keine Wörter und
 * fallen nicht darunter — gesucht wird das großgeschriebene Wort.
 */

const FRONTEND = join(__dirname, "..", "..");
const BACKEND = join(FRONTEND, "..", "backend", "app");

function dateien(ordner: string, endung: RegExp): string[] {
  return readdirSync(ordner).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".") || name === "__pycache__" || name === "__tests__") return [];
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad, endung);
    return endung.test(name) ? [pfad] : [];
  });
}

function ohneKommentareTs(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function ohneKommentarePy(text: string): string {
  return text.replace(/"""[\s\S]*?"""/g, "").replace(/#.*$/gm, "");
}

function fundstellen(pfade: string[], saeubern: (t: string) => string): string[] {
  return pfade.flatMap((pfad) =>
    saeubern(readFileSync(pfad, "utf8"))
      .split("\n")
      .filter((zeile) => /\bKI\b/.test(zeile))
      .map((zeile) => `${pfad.replace(FRONTEND, "frontend").replace(BACKEND, "backend/app")}: ${zeile.trim()}`),
  );
}

describe("Wording", () => {
  it("die Oberfläche sagt AI, nicht KI", () => {
    const pfade = ["app", "components", "lib"].flatMap((o) => dateien(join(FRONTEND, o), /\.tsx?$/));
    expect(fundstellen(pfade, ohneKommentareTs)).toEqual([]);
  });

  it("die Meldungen des Backends sagen AI, nicht KI", () => {
    expect(fundstellen(dateien(BACKEND, /\.py$/), ohneKommentarePy)).toEqual([]);
  });
});
