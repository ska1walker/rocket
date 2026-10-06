// Mein Postfach (seit 26.10.20): verbinden, Microsoft wird erklärt statt
// versucht, trennen über die Rückfrage — mit der Tastatur bis zum Ende.
// Gelesen wird hier nichts: Die CI hat kein Postfach, das Lesen prüft
// backend/tests/test_mailkonten.py mit einem Postfach aus Listen.

import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "einmal am Desktop genügt");

test("Mein Postfach: verbinden, Microsoft, trennen", async ({ page }) => {
  await page.goto("/einstellungen?bereich=postfach", { waitUntil: "networkidle" });
  const block = page.locator("section.block", { has: page.getByRole("heading", { name: "Mein Postfach" }) });
  await expect(block).toBeVisible();
  await expect(block.locator(".stufe")).toHaveText("nicht verbunden");

  // Microsoft: Rocket sagt den Grund, statt an der Anmeldung zu scheitern.
  await block.getByLabel("Anbieter").selectOption("eigen");
  await block.getByLabel("E-Mail-Adresse").fill("rundgang@firma.de");
  await block.getByLabel("Passwort", { exact: true }).fill("geheim");
  await block.getByLabel("IMAP-Server (Empfang)").fill("outlook.office365.com");
  await block.getByRole("button", { name: "Verbinden" }).click();
  await expect(block.getByRole("alert")).toContainText("Microsoft");

  // Eine Voreinstellung füllt die Server.
  await block.getByLabel("Anbieter").selectOption("ionos");
  await expect(block.getByLabel("IMAP-Server (Empfang)")).toHaveValue("imap.ionos.de");
  await expect(block.getByLabel("SMTP-Server (Versand)")).toHaveValue("smtp.ionos.de");
  await block.getByLabel("Passwort", { exact: true }).fill("geheim");
  await block.getByRole("button", { name: "Verbinden" }).click();
  await expect(block.getByLabel("Passwort", { exact: true })).toHaveAttribute("placeholder", /gespeichert/);
  await expect(block.getByRole("button", { name: "Verbindung testen" })).toBeVisible();

  // Trennen mit der Tastatur: Fokus auf „Abbrechen“, Escape schließt.
  await block.getByRole("button", { name: "Trennen" }).click();
  const dialog = page.getByRole("dialog", { name: "Trennen bestätigen" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await block.getByRole("button", { name: "Trennen" }).click();
  await page.getByRole("button", { name: "Postfach trennen" }).click();
  await expect(block.locator(".stufe")).toHaveText("nicht verbunden");
  await expect(block.getByRole("button", { name: "Verbindung testen" })).toHaveCount(0);
});
