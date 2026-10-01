import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rocket hält den Stand des AImighty-CI, ohne Netz geprüft.
 *
 * Das CI ist die Quelle für Token, Zeichen und Bausteine (ABGLEICH.md,
 * Paket 4; Kai, 1.10.2026). `scripts/ci-holen.mjs` holt einen Stand
 * `ci-YY.M.n` nach `ci/`; dieser Test prüft, dass die Kopie unverändert ist
 * und Rocket ihr entspricht. Weicht etwas ab, wird es zuerst im CI geändert
 * und neu geholt — nie hier still angepasst.
 */

const FRONTEND = join(__dirname, "..", "..");
const CI = join(FRONTEND, "ci");
const stand = JSON.parse(readFileSync(join(CI, "stand.json"), "utf8")) as {
  stand: string;
  commit: string;
  dateien: Record<string, string>;
};

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? dateien(pfad) : [relative(CI, pfad)];
  });
}

describe(`CI-Stand ${stand.stand}`, () => {
  it("ist ein Stand, nicht main", () => {
    expect(stand.stand).toMatch(/^ci-\d+\.\d+\.\d+$/);
    expect(stand.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("die Kopie ist unverändert: jede Datei passt zu ihrer Prüfsumme", () => {
    const da = dateien(CI).filter((p) => p !== "stand.json").sort();
    expect(da).toEqual(Object.keys(stand.dateien).sort());
    const abweichend = da.filter(
      (p) => createHash("sha256").update(readFileSync(join(CI, p))).digest("hex") !== stand.dateien[p],
    );
    expect(abweichend).toEqual([]);
  });

  it("der Token-Block in globals.css ist tokens/app.css", () => {
    const ab = (text: string) => text.slice(text.indexOf(":root {"));
    const css = readFileSync(join(FRONTEND, "app", "globals.css"), "utf8");
    const ende = css.indexOf('html[data-dichte="kompakt"]');
    const block = ab(css.slice(0, css.indexOf("\n", ende) + 1));
    expect(block).toBe(ab(readFileSync(join(CI, "tokens", "app.css"), "utf8")));
  });

  it("jeder Baustein-Abschnitt ist gleich bauteile/<KENNUNG>.css", () => {
    const aus = () =>
      execFileSync(
        "python3",
        [join(CI, "werkzeug", "bauteile.py"), join(FRONTEND, "app", "globals.css"), "--ohne-md"],
        { encoding: "utf8", stdio: "pipe" },
      );
    let meldung = "";
    try {
      meldung = aus();
    } catch (e) {
      meldung = (e as { stdout?: string }).stdout ?? String(e);
    }
    expect(meldung.trim().split("\n").pop()).toMatch(/gleich mit dem CI$/);
  });
});
