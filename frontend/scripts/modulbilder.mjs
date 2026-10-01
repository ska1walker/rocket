// Die Bilder der Bausteine (docs/MODULE.md, im CI unter bauteile/bilder/).
//
// Jeder Baustein, der eine Gestalt hat, wird auf einer echten Seite der
// laufenden App aufgenommen, hell und dunkel — kein Musterbogen, kein
// Nachbau. So zeigt das Bild, was die App wirklich zeigt (ABGLEICH.md,
// Paket 3; Kai, 1.10.2026).
//
//   ROCKET_CHROMIUM=/opt/pw-browsers/chromium node scripts/modulbilder.mjs [ziel-ordner]
//
// Erwartet eine laufende App mit Beispieldaten wie der Rundgang
// (ROCKET_URL, sonst http://localhost:3011). Ziel ist docs/module/.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const hier = dirname(fileURLToPath(import.meta.url));
const ZIEL = process.argv[2] ?? join(hier, "..", "..", "docs", "module");
const BASIS = process.env.ROCKET_URL ?? "http://localhost:3011";

async function erste(pfad) {
  const antwort = await (await fetch(BASIS + pfad)).json();
  const liste = Array.isArray(antwort) ? antwort : Object.values(antwort).find(Array.isArray);
  return liste[0].id;
}

/**
 * Je Baustein: Seite, was aufgenommen wird (Selektor oder die ganze Ansicht)
 * und was vorher geschieht. Bausteine ohne Gestalt (HB-TASTATUR, AM-BASIS,
 * HB-SYMBOL als Regel) fehlen hier mit Absicht, HB-FAKTOR auch: Den zweiten
 * Faktor gibt es nur im Modus `eigen`, die Beispieldaten laufen im Modus
 * `olares`.
 */
const BAUSTEINE = [
  { kennung: "am-huelle", pfad: "/" },
  { kennung: "hb-navigation", pfad: "/", sel: ".huelle-nav" },
  { kennung: "hb-kopfleiste", pfad: "/", sel: ".kopfleiste" },
  { kennung: "hb-marke", pfad: "/", sel: ".kopfleiste-marke" },
  { kennung: "hb-konto", pfad: "/", sel: ".huelle-fuss" },
  { kennung: "hb-kennzahl", pfad: "/", sel: ".kennzahlen" },
  { kennung: "hb-seitenkopf", pfad: "/firmen", sel: ".seitenkopf" },
  { kennung: "hb-knopfmenue", pfad: "/firmen", sel: ".seitenkopf .btn-reihe" },
  { kennung: "hb-tabelle", pfad: "/firmen", sel: ".huelle-inhalt" },
  { kennung: "hb-block", pfad: "/firmen/:companies" },
  { kennung: "hb-zeitleiste", pfad: "/firmen/:companies", sel: ".zeitleiste" },
  { kennung: "hb-ai", pfad: "/firmen/:companies", sel: ".seitenkopf .btn-reihe" },
  { kennung: "hb-board", pfad: "/deals", sel: ".board" },
  { kennung: "hb-pille", pfad: "/firmen", sel: "tbody .stufe" },
  { kennung: "hb-unternav", pfad: "/einstellungen?bereich=firma", sel: ".unternav" },
  { kennung: "hb-einstellungen", pfad: "/einstellungen?bereich=firma" },
  { kennung: "hb-erklaerung", pfad: "/einstellungen?bereich=vertrieb", sel: ".erklaerung" },
  { kennung: "hb-schalter", pfad: "/einstellungen?bereich=ki", sel: ".schalter-zeile" },
  { kennung: "hb-darstellung", pfad: "/", sel: ".person-liste",
    vorher: async (p) => { await p.locator(".person-knopf").click(); await p.waitForTimeout(200); } },
  { kennung: "hb-zustand", pfad: "/einstellungen?bereich=daten", sel: ".hinweis" },
  { kennung: "am-leer", pfad: "/besprechungen", sel: ".leerzustand" },
  { kennung: "hb-dialog", pfad: "/firmen", sel: ".dialog-schicht .dialog, .dialog-schicht > *",
    vorher: async (p) => { await p.getByRole("button", { name: /^Firma anlegen$/ }).first().click(); } },
  { kennung: "hb-suche", pfad: "/", sel: ".suche-feld, [role=dialog]:has(input[type=search]), .kopfleiste-suche",
    vorher: async (p) => { await p.locator(".kopfleiste-suche").first().click(); await p.waitForTimeout(300); } },
  { kennung: "hb-assistent", pfad: "/", sel: ".assistent-panel, [role=dialog][aria-label*='Assistent']",
    vorher: async (p) => { await p.locator(".assistent-knopf").click(); await p.waitForTimeout(400); } },
  { kennung: "hb-druck", pfad: "/angebote/:quotes/druck" },
  { kennung: "hb-tor", pfad: "/anmelden" },
];

const ids = {
  companies: await erste("/api/companies"),
  deals: await erste("/api/deals"),
  quotes: await erste("/api/quotes"),
};

mkdirSync(ZIEL, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ROCKET_CHROMIUM });
const fehlt = [];
for (const thema of ["hell", "dunkel"]) {
  const kontext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await kontext.addCookies([{ name: "rocket-darstellung", value: thema, url: BASIS }]);
  const seite = await kontext.newPage();
  for (const b of BAUSTEINE) {
    const pfad = b.pfad.replace(/:(\w+)/, (_, art) => ids[art]);
    await seite.goto(BASIS + pfad, { waitUntil: "networkidle" });
    if (b.vorher) await b.vorher(seite);
    const datei = join(ZIEL, `${b.kennung}${thema === "dunkel" ? "-dunkel" : ""}.png`);
    if (!b.sel) {
      await seite.screenshot({ path: datei });
      continue;
    }
    const ort = seite.locator(b.sel).first();
    if (!(await ort.count()) || !(await ort.isVisible())) {
      fehlt.push(`${b.kennung} (${thema}): ${b.sel} nicht sichtbar auf ${pfad}`);
      continue;
    }
    await ort.screenshot({ path: datei });
  }
  await kontext.close();
}
await browser.close();
for (const f of fehlt) console.error(f);
console.log(`${BAUSTEINE.length * 2 - fehlt.length} Bilder nach ${ZIEL}`);
process.exit(fehlt.length ? 1 : 0);
