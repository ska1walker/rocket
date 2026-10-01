// Die Dichte (HB-DARSTELLUNG): Weit, Normal, Kompakt — nur Maße, nie
// Schrift oder Farbe. Am Desktop wählbar und gemerkt, am Touchscreen wirkungslos.

import { expect, test, type Page } from "@playwright/test";

const zeilenhoehe = (page: Page) =>
  page.evaluate(() => Math.round(document.querySelector("tbody tr")!.getBoundingClientRect().height));
const schrift = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector("tbody td")!).fontSize);

async function waehle(page: Page, stufe: string) {
  await page.locator(".person-knopf").click();
  await page.getByRole("group", { name: "Dichte" }).getByRole("button", { name: stufe }).click();
  await page.keyboard.press("Escape");
}

test("Dichte: Kompakt macht Zeilen niedriger, Schrift bleibt, Wahl bleibt nach Neuladen", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "am Handy gibt es die Wahl nicht");
  await page.goto("/firmen", { waitUntil: "networkidle" });
  const weit = await zeilenhoehe(page);
  const schriftVorher = await schrift(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-dichte"))).toBeNull();

  await waehle(page, "Kompakt");
  await expect(page.locator("html")).toHaveAttribute("data-dichte", "kompakt");
  const kompakt = await zeilenhoehe(page);
  expect(kompakt, "Zeile kompakt niedriger als weit").toBeLessThan(weit);
  expect(await schrift(page), "Schrift unverändert").toBe(schriftVorher);

  // Das Skript im <head> setzt die Stufe vor dem ersten Anstrich.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-dichte", "kompakt");
  expect(await zeilenhoehe(page)).toBe(kompakt);

  await waehle(page, "Normal");
  await expect(page.locator("html")).toHaveAttribute("data-dichte", "normal");
  const normal = await zeilenhoehe(page);
  expect(normal).toBeGreaterThan(kompakt);
  expect(normal).toBeLessThan(weit);

  // Zurück auf die Vorgabe: kein Attribut, alte Höhe.
  await waehle(page, "Weit");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-dichte"))).toBeNull();
  expect(await zeilenhoehe(page)).toBe(weit);
});

test("Dichte: am Handy kein Attribut, auch mit Cookie", async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  test.skip(!isMobile, "nur am Handy");
  await context.addCookies([{ name: "rocket-dichte", value: "kompakt", url: baseURL! }]);
  await page.goto("/firmen", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-dichte"))).toBeNull();
  // Die Gruppe selbst rendert am Touchscreen nichts (Dichteteil in konto.tsx).
  await expect(page.getByRole("group", { name: "Dichte" })).toHaveCount(0);
});
