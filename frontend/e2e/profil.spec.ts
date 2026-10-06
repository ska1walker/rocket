// Das Profil oben rechts (CI HB-KONTO, ABGLEICH G8, Kai 6.10.2026): ganz
// rechts in der Kopfleiste, am Desktop und am Handy an derselben Stelle.
// Das Menü öffnet mit Kopf, „Mein Konto“ und Darstellung; Escape schließt
// es und gibt den Fokus zurück. Der Fuß der Navigation ist weg.

import { expect, test } from "@playwright/test";

test("Profil: ganz rechts, Menü per Tastatur, „Mein Konto“ führt ins Profil", async ({ page, isMobile }) => {
  await page.goto("/firmen", { waitUntil: "networkidle" });
  const knopf = page.locator(".kopfleiste .person-knopf");
  await expect(knopf).toBeVisible();
  await expect(knopf).toHaveAttribute("aria-label", /^Konto: /);

  // Ganz rechts: Kein anderes Element der Kopfleiste steht weiter rechts.
  const rechts = await page.evaluate(() => {
    const leiste = document.querySelector(".kopfleiste")!;
    const profil = leiste.querySelector(".person")!.getBoundingClientRect().right;
    const andere = [...leiste.children]
      .filter((k) => !k.classList.contains("person"))
      .map((k) => k.getBoundingClientRect().right);
    return { profil, andere: Math.max(...andere), leiste: leiste.getBoundingClientRect().right };
  });
  expect(rechts.profil).toBeGreaterThan(rechts.andere);
  expect(rechts.leiste - rechts.profil).toBeLessThan(24);

  // Kein Fuß mehr unter der Navigation, kein „Alles auf dieser Box“.
  await expect(page.locator(".huelle-fuss")).toHaveCount(0);
  await expect(page.getByText("Alles auf dieser Box")).toHaveCount(0);

  await knopf.focus();
  await page.keyboard.press("Enter");
  const menue = page.getByRole("dialog", { name: "Konto" });
  await expect(menue).toBeVisible();
  await expect(menue.getByRole("link", { name: "Mein Konto" })).toBeFocused();
  await expect(menue.locator(".person-name")).not.toHaveText("…");
  await page.keyboard.press("Escape");
  await expect(menue).toHaveCount(0);
  await expect(knopf).toBeFocused();

  if (isMobile) {
    // Am Handy ein Blatt über die ganze Breite.
    await knopf.click();
    const breite = await menue.evaluate((el) => el.getBoundingClientRect().width);
    expect(breite).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
    await menue.getByRole("link", { name: "Mein Konto" }).click();
  } else {
    await knopf.click();
    await menue.getByRole("link", { name: "Mein Konto" }).click();
  }
  await expect(page).toHaveURL(/bereich=profil/);
  await expect(page.getByRole("heading", { name: "Profil", level: 2 })).toBeVisible();
});

test("Einstellungen nur über das Profil: nicht in der Navigation, Organisation im Menü, Suche findet Bereiche", async ({ page, isMobile }) => {
  await page.goto("/firmen", { waitUntil: "networkidle" });
  // Kein Zahnrad in der Leiste, nicht unter „Mehr“ (CI G8, seit 26.10.22).
  const nav = page.locator("nav.huelle-nav");
  await expect(nav.locator('a[href="/einstellungen"]')).toHaveCount(0);
  if (isMobile) {
    await nav.getByRole("button", { name: "Mehr" }).last().click();
  } else {
    await nav.locator(".huelle-mehr-knopf").click();
  }
  await expect(page.locator('a[href="/einstellungen"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Die Eigentümerin sieht im Profil auch die Organisation.
  await page.locator(".kopfleiste .person-knopf").click();
  const menue = page.getByRole("dialog", { name: "Konto" });
  await menue.getByRole("link", { name: "Einstellungen der Organisation" }).click();
  await expect(page).toHaveURL(/bereich=firma/);

  // Die Suche findet einen Bereich der Einstellungen.
  if (!isMobile) {
    await page.getByRole("combobox", { name: "Suchen oder fragen" }).fill("passwort");
    const zeile = page.getByRole("option").filter({ hasText: "Sicherheit" });
    await expect(zeile).toContainText("Einstellung");
    await zeile.click();
    await expect(page).toHaveURL(/bereich=sicherheit/);
  }
});
