// Der Rundgang: jede Seite einmal, auf dem Desktop und auf dem Handy.
//
// Geprüft wird, was in der GUI-Prüfung vom 30.9.2026 echte Fehler fand
// (docs/BETRIEB.md, „GUI-Prüfung"): eine Antwort 4xx/5xx der API (die
// Aufgabenliste mit 400), ein Skriptfehler, eine Seite breiter als der
// Bildschirm (Angebotspositionen als 30-px-Streifen), ein Seitenkopf, aus dem
// etwas herausragt (die Knopfreihe am Lead), und Befunde der Stufen
// „critical" und „serious" von axe.
//
// Ausgenommen ist nur die axe-Regel color-contrast: Der gedämpfte Text liegt
// mit 4,36:1 knapp unter 4,5 — eine offene Entscheidung über die Token
// (AM-TOKEN), keine eines Bauteils. Fällt sie, fällt die Ausnahme.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SEITEN: [string, string][] = [
  ["Start", "/"],
  ["Board", "/deals"],
  ["Lead", "/deals/:deals"],
  ["Angebote", "/angebote"],
  ["Angebot", "/angebote/:quotes"],
  ["Druckfassung", "/angebote/:quotes/druck"],
  ["Prognose", "/prognose"],
  ["Firmen", "/firmen"],
  ["Firma", "/firmen/:companies"],
  ["Kontakte", "/kontakte"],
  ["Kontakt", "/kontakte/:contacts"],
  ["Listen", "/listen"],
  ["Liste", "/listen/:listen"],
  ["Kampagnen", "/kampagnen"],
  ["Kampagne", "/kampagnen/:kampagnen"],
  ["Tickets", "/tickets"],
  ["Ticket", "/tickets/:tickets"],
  ["Aufgaben", "/aufgaben"],
  ["Fragen", "/fragen"],
  ["Erkenntnisse", "/erkenntnisse"],
  ["Eingang", "/eingang"],
  ["Besprechungen", "/besprechungen"],
  ["Einfuhr", "/import"],
  ["Datenbank", "/datenbank"],
  ["Einstellungen Firma", "/einstellungen?bereich=firma"],
  ["Einstellungen Vertrieb", "/einstellungen?bereich=vertrieb"],
  ["Einstellungen Eigenschaften", "/einstellungen?bereich=eigenschaften"],
  ["Einstellungen E-Mail", "/einstellungen?bereich=email"],
  ["Einstellungen KI", "/einstellungen?bereich=ki"],
  ["Einstellungen Daten", "/einstellungen?bereich=daten"],
  ["Anmelden", "/anmelden"],
  ["Passwort vergessen", "/passwort-vergessen"],
];

/** `:companies` → die id des ersten Eintrags aus /api/companies. */
async function aufloesen(page: Page, pfad: string): Promise<string> {
  const m = pfad.match(/:([a-z]+)/);
  if (!m) return pfad;
  const antwort = await page.request.get(`/api/${m[1]}`);
  const daten = await antwort.json();
  const liste = Array.isArray(daten) ? daten : daten.tickets;
  return pfad.replace(m[0], liste[0].id);
}

for (const [name, muster] of SEITEN) {
  test(`${name} (${muster})`, async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(`Skriptfehler: ${e.message}`));
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) {
        fehler.push(`API ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });

    await page.goto(await aufloesen(page, muster), { waitUntil: "networkidle" });

    const lage = await page.evaluate(() => {
      const kopf = document.querySelector(".seitenkopf");
      const k = kopf?.getBoundingClientRect();
      const heraus = kopf
        ? [...kopf.querySelectorAll("*")]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && (r.bottom > k!.bottom + 1 || r.right > k!.right + 1 || r.left < k!.left - 1);
            })
            .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`)
        : [];
      return {
        ueberlauf: document.documentElement.scrollWidth - window.innerWidth,
        ueberschriften: document.querySelectorAll("h1").length,
        heraus: [...new Set(heraus)],
      };
    });

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze();
    const schwer = axe.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")}`);

    expect(fehler, "Fehler beim Laden").toEqual([]);
    expect(lage.ueberlauf, "Seite breiter als der Bildschirm").toBeLessThanOrEqual(1);
    expect(lage.ueberschriften, "genau eine h1").toBe(1);
    expect(lage.heraus, "ragt aus dem Seitenkopf").toEqual([]);
    expect(schwer, "axe critical/serious").toEqual([]);
  });
}

// Das Symbol auf dem Home-Bildschirm: ohne Angabe baut iOS eine Kachel aus
// dem ersten Buchstaben des Titels. Es muss das Rocket-Icon sein
// (docs/icon/rocket.svg, gerendert von scripts/app-symbole.mjs).
test("Web-App-Symbole: Apple-Touch-Icon, Favicon und Manifest", async ({ page }) => {
  await page.goto("/anmelden");
  const hrefs = await page.evaluate(() =>
    ["apple-touch-icon", "icon", "manifest"].map(
      (rel) => document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ?? null,
    ),
  );
  expect(hrefs.every(Boolean), "Link-Tags im Kopf").toBe(true);
  const manifest = await (await page.request.get(hrefs[2]!)).json();
  expect(manifest.short_name).toBe("Rocket");
  for (const pfad of [hrefs[0]!, hrefs[1]!, ...manifest.icons.map((i: { src: string }) => i.src)]) {
    const antwort = await page.request.get(pfad);
    expect(antwort.status(), pfad).toBe(200);
    expect(antwort.headers()["content-type"], pfad).toBe("image/png");
  }
});
