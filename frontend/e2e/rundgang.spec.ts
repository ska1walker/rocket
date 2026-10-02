// Der Rundgang: jede Seite einmal, auf dem Desktop und auf dem Handy.
//
// Geprüft wird, was in der GUI-Prüfung vom 30.9.2026 echte Fehler fand
// (docs/BETRIEB.md, „GUI-Prüfung"): eine Antwort 4xx/5xx der API (die
// Aufgabenliste mit 400), ein Skriptfehler, eine Seite breiter als der
// Bildschirm (Angebotspositionen als 30-px-Streifen), ein Seitenkopf, aus dem
// etwas herausragt (die Knopfreihe am Lead), und Befunde der Stufen
// „critical" und „serious" von axe — seit 26.10.3 einschließlich des
// Kontrasts: Kai hob den gedämpften Text auf #567595 (1.10.2026), und das
// letzte Schildchen darunter („Wunsch“) bekam Gold-900.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { lagePruefen } from "./lage";

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
  ["Einstellungen Übersicht", "/einstellungen"],
  ["Einstellungen Firma", "/einstellungen?bereich=firma"],
  ["Einstellungen Mein Postfach", "/einstellungen?bereich=postfach"],
  ["Einstellungen Vertrieb", "/einstellungen?bereich=vertrieb"],
  ["Einstellungen Eigenschaften", "/einstellungen?bereich=eigenschaften"],
  ["Einstellungen E-Mail", "/einstellungen?bereich=email"],
  ["Einstellungen AI", "/einstellungen?bereich=ki"],
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

for (const thema of ["hell", "dunkel"] as const)
for (const [name, muster] of SEITEN) {
  test(`${name} (${muster}) ${thema}`, async ({ page, context, baseURL }, testInfo) => {
    await context.addCookies([{ name: "rocket-darstellung", value: thema, url: baseURL! }]);
    const fehler: string[] = [];
    // Spurensicherung: Server-HTML, DOM danach und alle Konsolenmeldungen
    // hängen am Bericht, sobald ein Fehler kam. Ein minifizierter React-Fehler
    // verschweigt, welches Element abweicht — so ließ sich #418 auf die Marke
    // `«nxt-icon»` von Next zurückführen (BETRIEB.md, „#418“).
    const konsole: string[] = [];
    let serverHtml = "";
    page.on("console", (m) => konsole.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => fehler.push(`Skriptfehler: ${e.message}`));
    page.on("response", async (r) => {
      if (r.request().resourceType() === "document") serverHtml = await r.text().catch(() => "");
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

    const lageFunde = await page.evaluate(lagePruefen);

    // Ein Knopf, der nur ein Zeichen trägt, braucht einen Namen und einen
    // Tooltip mit demselben Wort (ABGLEICH G4 im CI, medien/app.md).
    const symbolknoepfe = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, a[href], [role=button]")]
        // checkVisibility statt offsetParent: In einem geschlossenen <details>
        // hat ein Knopf ein offsetParent, aber keinen gerenderten Text — er
        // erschien als Symbolknopf ohne Namen, sobald ein Feld archiviert war.
        .filter((e) => e.checkVisibility() && e.innerText.trim() === "")
        // Die Marke ist ein Bild mit Namen, kein Symbolknopf.
        .filter((e) => e.getAttribute("role") !== "switch" && !e.closest("label") && !e.querySelector("img"))
        .filter((e) => !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby")) || !e.getAttribute("title"))
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} „${e.getAttribute("aria-label") ?? ""}“`),
    );

    // HB-SYMBOL (ABGLEICH R2): jedes sichtbare Zeichen in 16, 20, 24 oder 40,
    // der Strich gerendert 1,5 px — auch wenn CSS die Größe verändert.
    const zeichen = await page.evaluate(() =>
      [...document.querySelectorAll<SVGSVGElement>("svg[data-symbol]")]
        .filter((s) => s.getBoundingClientRect().width > 0)
        .flatMap((s) => {
          const breite = Math.round(s.getBoundingClientRect().width);
          const strich = (parseFloat(getComputedStyle(s).strokeWidth) * breite) / 24;
          const name = s.getAttribute("data-symbol");
          return [16, 20, 24, 40].includes(breite) && Math.abs(strich - 1.5) < 0.05
            ? []
            : [`${name}: ${breite} px, Strich ${strich.toFixed(2)}`];
        }),
    );

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();
    const schwer = axe.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")}`);

    // Ein Skriptfehler kommt oft erst nach dem Laden — deshalb wird hier am
    // Ende gesichert, nicht direkt hinter goto (dort kam #418 noch nicht an).
    if (fehler.length) {
      await testInfo.attach("server.html", { body: serverHtml, contentType: "text/html" });
      await testInfo.attach("dom-danach.html", { body: await page.content(), contentType: "text/html" });
      await testInfo.attach("konsole.txt", { body: konsole.join("\n"), contentType: "text/plain" });
    }

    // Die Marke `<meta name="«nxt-icon»">` rendert Next nur, wenn Symbole über
    // die Metadaten laufen; bleibt sie im HTML stehen, folgt #418. Rocket
    // bindet die Symbole selbst ein (app/layout.tsx), also gibt es sie nie.
    expect(serverHtml.includes("nxt-icon"), "Next-Marke «nxt-icon» im Server-HTML").toBe(false);
    expect(fehler, "Fehler beim Laden").toEqual([]);
    expect(lage.ueberlauf, "Seite breiter als der Bildschirm").toBeLessThanOrEqual(1);
    expect(lage.ueberschriften, "genau eine h1").toBe(1);
    expect(lage.heraus, "ragt aus dem Seitenkopf").toEqual([]);
    expect(lageFunde, "Rand, Abstand, Mitte (e2e/lage.ts)").toEqual([]);
    expect([...new Set(symbolknoepfe)], "Symbolknopf ohne Namen oder Tooltip").toEqual([]);
    expect([...new Set(zeichen)], "Zeichen außerhalb 16/20/24/40 oder Strich nicht 1,5").toEqual([]);
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
  for (const pfad of [hrefs[0]!, ...manifest.icons.map((i: { src: string }) => i.src)]) {
    const antwort = await page.request.get(pfad);
    expect(antwort.status(), pfad).toBe(200);
    expect(antwort.headers()["content-type"], pfad).toBe("image/png");
  }
  // Im Tab nur die Rakete (ABGLEICH G7): als SVG, das der Tableiste folgt,
  // und als PNG für Safari, das kein SVG-Favicon nimmt.
  const tab = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="icon"]')].map((l) => l.getAttribute("href")!),
  );
  const arten = [];
  for (const pfad of tab) {
    const antwort = await page.request.get(pfad);
    expect(antwort.status(), pfad).toBe(200);
    arten.push(antwort.headers()["content-type"]);
  }
  expect(arten.sort(), "Tab-Zeichen als SVG und PNG").toEqual(["image/png", "image/svg+xml"]);
  expect(await page.title(), "Titel ohne Seitenkopf").toBe("Rocket");
});

// Der Tab nennt zuerst die Seite, dann die Anwendung (ABGLEICH G7).
test("Tab-Titel: Seite · Rocket", async ({ page }) => {
  await page.goto("/firmen", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle("Firmen · Rocket");
});

// Ein Leerzustand erscheint mit Beispieldaten fast nirgends — deshalb einmal
// absichtlich herbeigeführt: Das Zeichen stand bis 26.9.7 links vom Text.
test("Leerzustand: Zeichen mittig über dem Text", async ({ page }) => {
  await page.goto("/kontakte", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Name, E-Mail oder Firma").fill("zz-gibt-es-nicht-zz");
  await expect(page.locator(".leerzustand")).toBeVisible();
  expect(await page.evaluate(lagePruefen)).toEqual([]);
});
