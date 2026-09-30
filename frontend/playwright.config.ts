import { defineConfig, devices } from "@playwright/test";

// Der Rundgang im Browser (docs/BETRIEB.md, „GUI-Prüfung"). Er erwartet eine
// laufende App mit Beispieldaten — in der CI baut der Job „oberfläche" sie
// auf, lokal genügt `npm run e2e` gegen einen gestarteten Stand.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-bericht" }]],
  globalSetup: "./e2e/vorbereitung.ts",
  use: {
    baseURL: process.env.ROCKET_URL ?? "http://localhost:3011",
    screenshot: "only-on-failure",
    // Auf Rechnern mit vorinstalliertem Chromium (Claude-Sitzungen) liegt es
    // hier; in der CI installiert der Job den passenden Browser selbst.
    launchOptions: process.env.ROCKET_CHROMIUM ? { executablePath: process.env.ROCKET_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "handy", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
