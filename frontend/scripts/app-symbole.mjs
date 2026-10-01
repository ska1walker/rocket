// Die Symbole der Web-App aus dem Rocket-Icon (docs/icon/rocket.svg, Idee 6).
//
// Ohne sie baut iOS beim „Zum Home-Bildschirm" eine Kachel aus dem ersten
// Buchstaben des Titels. Gerendert wird mit Chromium und der Geist aus dem
// Repo. Seit 1.10.2026 trägt das Wappen die Rakete statt des „R“ (Figma,
// „Icon-Labor“, Abschnitt 0); auch das Markt-Icon icon.png entsteht hier.
//
//   ROCKET_CHROMIUM=/opt/pw-browsers/chromium node scripts/app-symbole.mjs
//
// Drei Formen: „tab" ist das Zeichen im Browser-Tab, „rund" die Kachel wie im
// Markt (Manifest), „voll"
// füllt das Quadrat ohne Ecken und Rand — iOS und Android runden selbst, eine
// eigene Rundung gäbe dort schwarze Ecken.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const hier = dirname(fileURLToPath(import.meta.url));
const frontend = join(hier, "..");
const quelle = readFileSync(join(frontend, "..", "docs", "icon", "rocket.svg"), "utf8");
// Das Zeichen im Browser-Tab (ABGLEICH G7): nur die Rakete. Als SVG folgt es
// der Tableiste; Safari nimmt kein SVG-Favicon und bekommt dieses PNG in
// einem Gold dazwischen, das auf hellen und dunklen Leisten trägt.
const tab = readFileSync(join(frontend, "..", "docs", "icon", "tab.svg"), "utf8");
const schrift = readFileSync(join(frontend, "app", "fonts", "Geist-Variable.woff2")).toString("base64");

function form(art) {
  if (art === "rund") return quelle;
  if (art === "tab") return tab.replace(/<style>[\s\S]*?<\/style>/, "").replace("<g ", '<g stroke="#b08a3e" ');
  const voll = quelle
    .replace('<g clip-path="url(#kachel)">', "<g>")
    .replace(/<rect x="1" y="1" width="158"[^>]*\/>/, "");
  if (voll === quelle) throw new Error("rocket.svg hat sich verändert — Ersetzungen prüfen");
  return voll;
}

const ZIELE = [
  ["public/icon-32.png", "tab", 32],
  ["public/apple-touch-icon.png", "voll", 180],
  ["public/symbol/rocket-192.png", "rund", 192],
  ["public/symbol/rocket-512.png", "rund", 512],
  ["public/symbol/rocket-maskable-512.png", "voll", 512],
  // Das Markt-Icon (OlaresManifest: icon, featuredImage) — dieselbe Kachel.
  ["../icon.png", "rund", 512],
];

const browser = await chromium.launch({ executablePath: process.env.ROCKET_CHROMIUM || undefined });
const seite = await browser.newPage();
for (const [ziel, art, groesse] of ZIELE) {
  await seite.setViewportSize({ width: groesse, height: groesse });
  const svg = form(art).replace(/width="(512|32)" height="(512|32)"/, `width="${groesse}" height="${groesse}"`);
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
