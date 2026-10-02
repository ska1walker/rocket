// Sicht nach Zuordnung im Browser (seit 26.10.17).
//
// Die Leitung legt per API zwei Firmen mit je einem Kontakt an und einen
// Trainer, der nur Firma A sieht. Der Trainer löst seine Einladung ein und
// geht seine Seiten durch — hell und dunkel, am Desktop und am Handy — mit
// denselben Prüfungen wie der Rundgang: keine Antwort 4xx/5xx der API (die
// Oberfläche bietet nichts an, was der Server abweist), kein Skriptfehler,
// nichts breiter als der Bildschirm, Lage, axe.
//
// Dazu die Leitung: Sicht-Dialog per Tastatur, Bereich an der Firma, Eltern
// am Kind anlegen.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { lagePruefen } from "./lage";

const BASIS = process.env.ROCKET_URL ?? "http://localhost:3011";
const PASSWORT = "rundgang-trainer-passwort";

type Aufbau = { a: string; b: string; eigen: string; fremd: string; trainer: string; trainerName: string };

async function json<T>(antwort: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(antwort.ok(), `${antwort.url()}: ${antwort.status()} ${await antwort.text()}`).toBe(true);
  return (await antwort.json()) as T;
}

async function aufbauen(leitung: APIRequestContext): Promise<Aufbau> {
  const z = `${Date.now()}`.slice(-6);
  const bereich = await json<{ id: string }>(await leitung.post("/api/bereiche", { data: { name: `Rundgang ${z}` } }));
  const a = await json<{ id: string }>(await leitung.post("/api/companies", { data: { name: `Mannschaft A ${z}` } }));
  const b = await json<{ id: string }>(await leitung.post("/api/companies", { data: { name: `Mannschaft B ${z}` } }));
  await leitung.put(`/api/companies/${a.id}/bereich`, { data: { bereich_id: bereich.id } });
  const eigen = await json<{ id: string }>(await leitung.post("/api/contacts", { data: { first_name: "Eigener", last_name: `Spieler ${z}`, company_id: a.id } }));
  const fremd = await json<{ id: string }>(await leitung.post("/api/contacts", { data: { first_name: "Fremder", last_name: `Spieler ${z}`, company_id: b.id } }));
  const trainerName = `Trainer ${z}`;
  const trainer = await json<{ id: string }>(await leitung.post("/api/mitglieder", { data: { display_name: trainerName } }));
  await json(await leitung.put(`/api/mitglieder/${trainer.id}/sicht`, {
    data: { sicht: "eingeschraenkt", zugriffe: [{ company_id: a.id, stufe: "bearbeiten" }] },
  }));
  return { a: a.id, b: b.id, eigen: eigen.id, fremd: fremd.id, trainer: trainer.id, trainerName };
}

/** Ein Browserkontext, in dem der Trainer angemeldet ist — über eine frische
 *  Einladung, denn jede gilt genau einmal. */
async function alsTrainer(browser: Browser, leitung: APIRequestContext, aufbau: Aufbau, thema: string, viewport: { width: number; height: number }) {
  const einladung = await json<{ pfad: string }>(await leitung.post(`/api/mitglieder/${aufbau.trainer}/einladung`));
  const kontext = await browser.newContext({ baseURL: BASIS, viewport });
  await kontext.addCookies([{ name: "rocket-darstellung", value: thema, url: BASIS }]);
  const r = await kontext.request.post(`/api/einladung/${einladung.pfad.split("/").pop()}`, { data: { passwort: PASSWORT } });
  expect(r.status(), await r.text()).toBe(200);
  return kontext;
}

let aufbau: Aufbau;

test.beforeAll(async ({ playwright }) => {
  const leitung = await playwright.request.newContext({ baseURL: BASIS });
  aufbau = await aufbauen(leitung);
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
  test(`Rundgang als Trainer ${thema}`, async ({ browser, viewport, request }) => {
    test.setTimeout(180_000);
    const kontext = await alsTrainer(browser, request, aufbau, thema, viewport ?? { width: 1400, height: 900 });
    const page = await kontext.newPage();

    for (const pfad of [
      "/kontakte",
      `/kontakte/${aufbau.eigen}`,
      "/firmen",
      `/firmen/${aufbau.a}`,
      `/firmen/${aufbau.b}`,
      "/aufgaben",
      "/listen",
      "/kampagnen",
      "/fragen",
      "/einstellungen",
      "/einstellungen?bereich=firma",
    ]) {
      await pruefen(page, pfad);
    }

    // Was er sieht: den eigenen Spieler, nicht den fremden — und einen Satz dazu.
    await page.goto("/kontakte", { waitUntil: "networkidle" });
    await expect(page.locator(".seitenhinweise .hinweis")).toContainText("Mannschaft A");
    await expect(page.getByText(`Eigener`, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(`Fremder`, { exact: true })).toHaveCount(0);

    // Start führt zu den Kontakten; Leads gibt es für ihn nicht.
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/kontakte$/);
    await expect(page.locator(".huelle-nav").getByRole("link", { name: "Leads" })).toHaveCount(0);
    await page.goto("/deals", { waitUntil: "networkidle" });
    await expect(page.getByText("Dieser Bereich ist nicht freigegeben")).toBeVisible();

    await kontext.close();
  });
}

test("Leitung: Sicht-Dialog per Tastatur, Sichtbarkeit an der Firma", async ({ page, isMobile }) => {
  test.skip(isMobile, "einmal am Desktop genügt");
  await page.goto("/einstellungen?bereich=firma", { waitUntil: "networkidle" });
  const knopf = page.getByRole("button", { name: `Sicht von ${aufbau.trainerName} festlegen` });
  await knopf.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.querySelector("[role=dialog]")?.contains(document.activeElement))).toBe(true);
  }
  await expect(dialog.locator(".sicht-satz")).toContainText(`${aufbau.trainerName} sieht die Kontakte von Mannschaft A`);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Bereiche stehen in den Einstellungen, der Trainer an seiner Firma.
  await expect(page.getByRole("heading", { name: "Bereiche" })).toBeVisible();
  await page.goto(`/firmen/${aufbau.a}`, { waitUntil: "networkidle" });
  const sichtbarkeit = page.locator("section.block", { has: page.getByRole("heading", { name: "Sichtbarkeit" }) });
  await expect(sichtbarkeit).toContainText(aufbau.trainerName);
  expect(await page.evaluate(lagePruefen)).toEqual([]);
});

test("Eltern am Kind anlegen", async ({ page, isMobile }) => {
  test.skip(isMobile, "einmal am Desktop genügt");
  await page.goto(`/kontakte/${aufbau.eigen}`, { waitUntil: "networkidle" });
  const block = page.locator("section.block", { has: page.getByRole("heading", { name: "Bezugspersonen" }) });
  await block.getByRole("button", { name: "Neu anlegen" }).click();
  await block.getByLabel("Vorname").fill("Erika");
  await block.getByLabel("Nachname").fill("Rundgang");
  await block.getByRole("button", { name: "Anlegen und verknüpfen" }).click();
  await expect(block.getByRole("link", { name: "Erika Rundgang" })).toBeVisible();
  await expect(block).toContainText("Erziehungsberechtigt");
  expect(await page.evaluate(lagePruefen)).toEqual([]);
});
