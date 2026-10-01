// API-Schlüssel (seit 26.10.14): im Browser erzeugen, mit dem Schlüssel
// über den Proxy der Oberfläche aufrufen — so, wie ein Programm von außen
// es tut —, widerrufen, und danach kommt er nicht mehr herein.

import { expect, test, type Page } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "einmal am Desktop genügt");

const fokusImDialog = (page: Page) =>
  page.evaluate(() => !!document.querySelector("[role=dialog]")?.contains(document.activeElement));

test("API-Schlüssel: erzeugen, damit aufrufen, widerrufen", async ({ page, playwright, baseURL }) => {
  await page.goto("/einstellungen?bereich=ki", { waitUntil: "networkidle" });
  const block = page.locator("section.block", { has: page.getByRole("heading", { name: "API-Schlüssel" }) });
  await expect(block).toBeVisible();

  // Tastatur: Fokus im Dialog, Tab bleibt drin, Escape schließt.
  await block.getByRole("button", { name: "Erzeugen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => fokusImDialog(page), { message: "Fokus im Dialog" }).toBe(true);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await fokusImDialog(page), `Tab ${i + 1} bleibt im Dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await block.getByRole("button", { name: "Erzeugen", exact: true }).click();
  const name = `Rundgang ${Date.now()}`;
  await page.getByLabel("Wofür").fill(name);
  await page.keyboard.press("Enter");
  const klartext = (await block.locator(".api-schluessel-neu code").textContent())!.trim();
  expect(klartext).toMatch(/^rk_/);

  const programm = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${klartext}` },
  });
  expect((await programm.get("/api/eigenschaften?entity=companies")).status()).toBe(200);
  expect((await programm.get("/api/companies")).status()).toBe(403);

  await block.getByRole("button", { name: "Habe ich" }).click();
  await expect(block.locator(".api-schluessel-neu")).toHaveCount(0);
  const zeile = block.locator("tr", { hasText: name });
  await zeile.getByRole("button", { name: "Widerrufen" }).click();
  await page.getByRole("button", { name: "Schlüssel widerrufen" }).click();
  await expect(zeile).toHaveCount(0);

  expect((await programm.get("/api/eigenschaften?entity=companies")).status()).toBe(401);
  await programm.dispose();
});
