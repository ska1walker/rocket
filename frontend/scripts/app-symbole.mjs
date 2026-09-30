// Die Symbole der Web-App aus dem Rocket-Icon (docs/icon/rocket.svg, Idee 6).
//
// Ohne sie baut iOS beim „Zum Home-Bildschirm" eine Kachel aus dem ersten
// Buchstaben des Titels. Gerendert wird mit Chromium und der Geist aus dem
// Repo, damit das „R" dasselbe ist wie im Markt-Icon.
//
//   ROCKET_CHROMIUM=/opt/pw-browsers/chromium node scripts/app-symbole.mjs
//
// Zwei Formen: „rund" ist die Kachel wie im Markt (Favicon, Manifest), „voll"
// füllt das Quadrat ohne Ecken und Rand — iOS und Android runden selbst, eine
// eigene Rundung gäbe dort schwarze Ecken.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const hier = dirname(fileURLToPath(import.meta.url));
const frontend = join(hier, "..");
const quelle = readFileSync(join(frontend, "..", "docs", "icon", "rocket.svg"), "utf8");
const schrift = readFileSync(join(frontend, "app", "fonts", "Geist-Variable.woff2")).toString("base64");

function form(art) {
  if (art === "rund") return quelle;
  const voll = quelle
    .replace('<g clip-path="url(#kachel)">', "<g>")
    .replace(/<rect x="1" y="1" width="158"[^>]*\/>/, "");
  if (voll === quelle) throw new Error("rocket.svg hat sich verändert — Ersetzungen prüfen");
  return voll;
}

const ZIELE = [
  ["app/icon.png", "rund", 64],
  ["app/apple-icon.png", "voll", 180],
  ["public/symbol/rocket-192.png", "rund", 192],
  ["public/symbol/rocket-512.png", "rund", 512],
  ["public/symbol/rocket-maskable-512.png", "voll", 512],
];

const browser = await chromium.launch({ executablePath: process.env.ROCKET_CHROMIUM || undefined });
const seite = await browser.newPage();
for (const [ziel, art, groesse] of ZIELE) {
  await seite.setViewportSize({ width: groesse, height: groesse });
  const svg = form(art).replace(/width="512" height="512"/, `width="${groesse}" height="${groesse}"`);
  await seite.setContent(
    `<style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${schrift}) format("woff2");font-weight:100 900}
     html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  await seite.evaluate(() => document.fonts.ready);
  const bild = await seite.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(join(frontend, ziel), bild);
  console.log(ziel, groesse, bild.length);
}
await browser.close();
