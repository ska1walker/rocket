// Modus Verein im Browser (seit 26.10.19).
//
// Die Leitung schaltet per API auf „Verein“ und geht die Seiten durch — hell
// und dunkel, Desktop und Handy, mit denselben Prüfungen wie der Rundgang.
// Dazu: Vereinsfelder anlegen, eine Person mit Vorlage „Trainer“ hinzufügen
// (der Sicht-Dialog folgt von selbst). Am Ende zurück auf Vertrieb — die
// übrigen Rundgänge erwarten ihn.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { lagePruefen } from "./lage";

const BASIS = process.env.ROCKET_URL ?? "http://localhost:3011";

let mannschaft = "";
let person = "";

test.beforeAll(async ({ playwright }) => {
  const leitung = await playwright.request.newContext({ baseURL: BASIS });
  const z = `${Date.now()}`.slice(-6);
  mannschaft = (await (await leitung.post("/api/companies", { data: { name: `Erste Herren ${z}` } })).json()).id;
  person = (await (await leitung.post("/api/contacts", { data: { first_name: "Lena", last_name: `Spielerin ${z}`, company_id: mannschaft } })).json()).id;
  expect((await leitung.put("/api/settings", { data: { modus: "verein" } })).ok()).toBe(true);
  await leitung.dispose();
});

test.afterAll(async ({ playwright }) => {
  const leitung = await playwright.request.newContext({ baseURL: BASIS });
  await leitung.put("/api/settings", { data: { modus: "vertrieb" } });
  await leitung.dispose();
});

async function pruefen(page: Page, pfad: string) {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(`Skriptfehler: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) fehler.push(`API ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  await page.goto(pfad, { waitUntil: "networkidle" });
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const lage = await page.evaluate(lagePruefen);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze();
  const schwer = axe.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")}`);
  expect(fehler, `${pfad}: Fehler beim Laden`).toEqual([]);
  expect(ueberlauf, `${pfad}: breiter als der Bildschirm`).toBeLessThanOrEqual(1);
  expect(lage, `${pfad}: Rand, Abstand, Mitte`).toEqual([]);
  expect(schwer, `${pfad}: axe`).toEqual([]);
}

for (const thema of ["hell", "dunkel"] as const) {
  test(`Rundgang im Verein ${thema}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.addCookies([{ name: "rocket-darstellung", value: thema, url: BASIS }]);
    for (const pfad of [
      "/kontakte",
      `/kontakte/${person}`,
      "/firmen",
      `/firmen/${mannschaft}`,
      "/kampagnen",
      "/einstellungen?bereich=firma",
      "/einstellungen?bereich=eigenschaften",
    ]) {
      await pruefen(page, pfad);
    }

    // Die Wörter des Vereins, und kein Vertrieb in der Navigation.
    await page.goto("/firmen", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Mannschaften" })).toBeVisible();
    await expect(page).toHaveTitle(/^Mannschaften · Rocket$/);
    const nav = page.locator(".huelle-nav");
    await expect(nav.getByRole("link", { name: "Leads" })).toHaveCount(0);
    // Start führt zu den Personen.
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/kontakte$/);
    await expect(page.getByRole("heading", { level: 1, name: "Personen" })).toBeVisible();
    // An der Mannschaft: keine Leads.
    await page.goto(`/firmen/${mannschaft}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Über diese Mannschaft" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leads" })).toHaveCount(0);
  });
}

test("Vereinsfelder anlegen und Trainer mit Vorlage hinzufügen", async ({ page, isMobile }) => {
  test.skip(isMobile, "einmal am Desktop genügt");
  await page.goto("/einstellungen?bereich=firma", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Modus" })).toBeVisible();
  await page.getByRole("button", { name: "Vereinsfelder anlegen" }).click();
  await expect(page.getByRole("status").filter({ hasText: /angelegt|gab es schon/ })).toBeVisible();

  // Die vertrauliche Gruppe steht an der Person, mit Schild.
  await page.goto(`/kontakte/${person}`, { waitUntil: "networkidle" });
  await expect(page.locator(".fg-gruppe", { hasText: "Beitrag und Bank" }).locator(".fg-vertraulich")).toBeVisible();
  await expect(page.locator(".fg-gruppe", { hasText: "Spielerdaten" })).toBeVisible();

  // Vorlage „Trainer“: danach öffnet sich der Sicht-Dialog.
  await page.goto("/einstellungen?bereich=firma", { waitUntil: "networkidle" });
  const name = `Trainer Vorlage ${Date.now().toString().slice(-5)}`;
  await page.getByLabel("Person hinzufügen").fill(name);
  await page.locator("#mitgliedvorlage").selectOption({ label: "Trainer" });
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  const dialog = page.getByRole("dialog", { name: `Sicht von ${name}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(`Was ${name} sieht`)).toHaveValue("eingeschraenkt");
  await expect(dialog.getByRole("heading", { name: "Einzelne Mannschaften" })).toBeVisible();
  await page.keyboard.press("Escape");
});
