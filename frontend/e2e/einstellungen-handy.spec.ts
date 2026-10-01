// Das Untermenü der Einstellungen auf dem Handy (HB-UNTERNAV): erst die
// Übersicht, dann ein Bereich, und „Alle Einstellungen“ führt zurück.

import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => !isMobile, "Nur auf dem Handy");

test("Handy: Übersicht → Bereich → zurück", async ({ page }) => {
  await page.goto("/einstellungen", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Bereiche der Einstellungen" });
  await expect(nav).toBeVisible();
  await expect(page.locator(".unternav-inhalt")).toBeHidden();

  await nav.getByRole("link", { name: /Daten/ }).click();
  await expect(page).toHaveURL(/bereich=daten/);
  await expect(nav).toBeHidden();
  await expect(page.getByRole("heading", { name: "Sicherung" })).toBeVisible();

  await page.getByRole("link", { name: "Alle Einstellungen" }).click();
  await expect(page).toHaveURL(/\/einstellungen$/);
  await expect(nav).toBeVisible();
});
