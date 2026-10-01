import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strich } from "@/components/symbol";

/**
 * Ein Icon-Set für alle Apps (ABGLEICH.md, R2; Kai, 1.10.2026): Rocket
 * zeichnet nur aus dem CI-Set, über HB-SYMBOL. Der Test hält drei Dinge fest:
 * kein Import aus lucide-react, lib/symbole.tsx ist aus symbole/ erzeugt, und
 * der Strich bleibt bei jeder Größe 1,5 px.
 */

const FRONTEND = join(__dirname, "..", "..");

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(tsx?|mjs)$/.test(name) ? [pfad] : [];
  });
}

describe("HB-SYMBOL", () => {
  it("niemand importiert lucide-react", () => {
    const quellen = ["app", "components", "lib", "e2e"].flatMap((o) => dateien(join(FRONTEND, o)));
    const treffer = quellen.filter((p) => /from\s+["']lucide-react["']/.test(readFileSync(p, "utf8")));
    expect(treffer).toEqual([]);
    expect(readFileSync(join(FRONTEND, "package.json"), "utf8")).not.toContain("lucide");
  });

  it("lib/symbole.tsx ist aus symbole/ erzeugt", () => {
    expect(() =>
      execFileSync("node", [join(FRONTEND, "scripts", "symbole-erzeugen.mjs"), "--pruefen"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("Strich 1,5 px bei jeder Größe", () => {
    for (const groesse of [16, 20, 24, 40] as const) {
      expect((strich(groesse) * groesse) / 24).toBeCloseTo(1.5);
    }
  });
});
