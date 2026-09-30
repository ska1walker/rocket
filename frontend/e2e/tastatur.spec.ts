// Die Wege ohne Maus — jeder davon fehlte einmal (docs/BETRIEB.md,
// „GUI-Prüfung"): Dialoge ließen Tab hinaus und Escape unbeachtet, keine
// Liste ließ sich öffnen, keine Karte verschieben, das Menü „Erstellen"
// kannte keine Pfeile. Nur auf dem Desktop; das Handy hat keine Tastatur.

import { expect, test, type Page } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "Tastaturwege nur auf dem Desktop");

const fokusImDialog = (page: Page) =>
  page.evaluate(() => !!document.querySelector("[role=dialog]")?.contains(document.activeElement));

for (const art of ["Kontakt", "Firma", "Lead", "Ticket"]) {
  test(`Dialog „${art} anlegen“: Fokus, Tab, Escape`, async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(".kopf-neu").click();
    await page.getByRole("menuitem", { name: art, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await expect.poll(() => fokusImDialog(page), { message: "Fokus im Dialog" }).toBe(true);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await fokusImDialog(page), `Tab ${i + 1} bleibt im Dialog`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

test("Menü „Erstellen“: Pfeile und Escape zurück zum Knopf", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".kopf-neu").focus();
  await page.keyboard.press("Enter");
  const punkte = page.getByRole("menuitem");
  await expect(punkte.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(punkte.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(punkte.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".kopf-neu")).toBeFocused();
});

test("Liste: Zeile mit Tab erreichen und mit Enter öffnen", async ({ page }) => {
  await page.goto("/firmen", { waitUntil: "networkidle" });
  const ziel = page.locator(".zeilen-ziel").first();
  await ziel.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/firmen\/[0-9a-f-]{36}/);
});

test("Aufgaben als Tabelle: lädt ohne Fehler und führt nirgendwohin, wo es nichts gibt", async ({ page }) => {
  // Die Tabelle sortiert ohne Ansicht nach updated_at — das war ein 400.
  const fehler: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) fehler.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("/aufgaben", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".tabelle")).toBeVisible();
  await expect(page.locator("tr[data-ziel], .zeilen-ziel")).toHaveCount(0);
  expect(fehler).toEqual([]);
});

test("Reiter: Pfeil nach rechts wählt den nächsten", async ({ page }) => {
  await page.goto("/aufgaben", { waitUntil: "networkidle" });
  const gewaehlt = page.locator("[role=tab][aria-selected=true]");
  const vorher = await gewaehlt.textContent();
  await gewaehlt.focus();
  await page.keyboard.press("ArrowRight");
  await expect(gewaehlt).not.toHaveText(vorher ?? "");
  await expect(gewaehlt).toBeFocused();
});

test("Board: Alt+Pfeil schiebt die Karte, der Fokus folgt", async ({ page }) => {
  await page.goto("/deals", { waitUntil: "networkidle" });
  const spalteVon = (id: string) =>
    page.evaluate(
      (id) => [...document.querySelectorAll(".board-spalte")].findIndex((s) => s.querySelector(`[data-karte="${id}"]`)),
      id,
    );
  // Irgendeine Karte, die rechts noch eine Spalte hat.
  const id = await page.evaluate(() => {
    const spalten = [...document.querySelectorAll(".board-spalte")];
    for (const s of spalten.slice(0, -1)) {
      const k = s.querySelector("[data-karte]");
      if (k) return k.getAttribute("data-karte");
    }
    return null;
  });
  expect(id, "eine Karte mit rechter Nachbarspalte").not.toBeNull();
  const karte = page.locator(`[data-karte="${id}"]`);
  const vorher = await spalteVon(id!);

  await karte.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => spalteVon(id!)).toBe(vorher + 1);
  await expect(page.locator(`[data-karte="${id}"]`)).toBeFocused();

  // Zurück, damit der Bestand bleibt, wie er war.
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => spalteVon(id!)).toBe(vorher);
});

test("Assistent: Escape schließt und gibt den Fokus dem Schild zurück", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".assistent-knopf").click();
  await expect(page.locator(".assistent-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".assistent-panel")).toHaveCount(0);
  await expect(page.locator(".assistent-knopf")).toBeFocused();
});

test("Rückfrage vor dem Löschen: Fokus auf „Abbrechen“, Escape löscht nichts", async ({ page }) => {
  const firmen = await (await page.request.get("/api/companies")).json();
  await page.goto(`/firmen/${firmen[0].id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Alles bearbeiten|Bearbeiten/ }).first().click();
  await page.locator(".fg-loeschknopf").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abbrechen" }).last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.request.get(`/api/companies/${firmen[0].id}`)).status()).toBe(200);
});
