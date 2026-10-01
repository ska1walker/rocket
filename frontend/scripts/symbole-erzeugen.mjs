// HB-SYMBOL — erzeugt lib/symbole.tsx aus den Zeichen in symbole/.
//
// symbole/ ist eine unveränderte Kopie der benutzten Zeichen aus dem CI-Repo
// (ska1walker/aimighty-ci, marke/icons/ui/). Ein Zeichen kommt zuerst dort
// ins Set, über dessen Erzeuger, dann hierher (ABGLEICH.md, R2; Kai,
// 1.10.2026). Rocket zeichnet nichts direkt aus Lucide.
//
//   node scripts/symbole-erzeugen.mjs                 # schreibt lib/symbole.tsx
//   node scripts/symbole-erzeugen.mjs --ci ../../aimighty-ci   # holt erst die Kopie neu
//   node scripts/symbole-erzeugen.mjs --pruefen       # Rückgabe 1, wenn etwas abweicht
//
// Die Exportnamen bleiben die von lucide-react, damit eine Datei nur ihre
// Importzeile ändert. Die Liste unten hält Exportname ↔ CI-Name fest.

import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const frontend = join(hier, "..");

export const NAMEN = {
  AlertCircle: "fehler",
  AlertTriangle: "achtung",
  Archive: "datensicherung",
  ArchiveRestore: "wiederherstellen",
  ArrowDown: "pfeil-runter",
  ArrowLeft: "zurueck",
  ArrowUp: "pfeil-hoch",
  Bookmark: "lesezeichen",
  Building2: "firma",
  Check: "erfolg",
  CheckCircle2: "erledigt",
  CheckSquare: "aufgabe",
  ChevronDown: "chevron",
  ChevronLeft: "chevron-links",
  ChevronRight: "chevron-rechts",
  ChevronsUpDown: "auswahl-oeffnen",
  Circle: "offen",
  ClipboardPaste: "einfuegen",
  Clock: "frist",
  Columns3: "spalten",
  Copy: "kopieren",
  Cpu: "grafikeinheit",
  Database: "datenbank",
  Download: "herunterladen",
  Ellipsis: "mehr",
  ExternalLink: "extern",
  Eye: "anzeigen",
  EyeOff: "verbergen",
  File: "dokument",
  FileClock: "bindefrist",
  FileImage: "bilddatei",
  FileSpreadsheet: "tabellenblatt",
  FileText: "dokumente",
  Filter: "filter",
  Globe: "netzrecherche",
  GripVertical: "griff",
  Handshake: "lead",
  Headphones: "podcast",
  ImageUp: "bild-hochladen",
  Inbox: "eingang",
  Info: "hinweis",
  KeyRound: "schluessel",
  Laptop: "geraet-laptop",
  LayoutDashboard: "start",
  LifeBuoy: "ticket",
  Lightbulb: "erkenntnis",
  ListChecks: "liste",
  Lokal: "lokal",
  Lock: "schloss",
  LogOut: "abmelden",
  Mail: "post",
  Megaphone: "kampagne",
  MessageCircleQuestion: "frage",
  MessageSquareOff: "stille",
  MessagesSquare: "besprechung",
  Monitor: "geraet-bildschirm",
  Moon: "modus",
  PanelLeftClose: "seitenleiste-zu",
  PanelLeftOpen: "seitenleiste-auf",
  Pencil: "bearbeiten",
  Play: "lauf-gestartet",
  Plus: "plus",
  Printer: "drucken",
  RolleAnalyst: "rolle-analyst",
  RolleAssistent: "rolle-assistent",
  RolleExperte: "rolle-experte",
  Save: "speichern",
  Search: "suche",
  Settings: "einstellungen",
  ShieldCheck: "geschuetzt",
  SlidersHorizontal: "eigenschaften",
  Smartphone: "geraet-telefon",
  Sparkles: "ai",
  Star: "standard",
  Sun: "hell",
  Table2: "tabelle",
  Target: "ziel",
  Trash2: "loeschen",
  TrendingUp: "prognose",
  Upload: "hochladen",
  UserMinus: "person-entfernen",
  UserSearch: "person-finden",
  Users: "team",
  X: "schliessen",
};

const KOPF =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
  'stroke-linejoin="round">';

/** Die Kinder eines CI-Zeichens als JSX. Der Rumpf muss genau der des Sets sein. */
export function inhalt(name) {
  const text = readFileSync(join(frontend, "symbole", `${name}.svg`), "utf8");
  if (!text.startsWith(KOPF) || !text.endsWith("</svg>")) {
    throw new Error(`symbole/${name}.svg hat nicht den Rumpf des CI-Sets`);
  }
  const kinder = text.slice(KOPF.length, -"</svg>".length).trim();
  if (/[{}]|-[a-z]+=|style=|class=/.test(kinder)) {
    throw new Error(`symbole/${name}.svg: Attribut, das als JSX nicht trägt`);
  }
  return kinder.replace(/ \/> </g, " /><");
}

export function erzeugen() {
  const zeilen = Object.entries(NAMEN).map(
    ([exp, name]) => `export const ${exp} = symbol("${name}", <>${inhalt(name)}</>);`,
  );
  return `// HB-SYMBOL — erzeugt von scripts/symbole-erzeugen.mjs aus symbole/, nicht von Hand ändern.
// Die Zeichen kommen aus dem CI-Set (aimighty-ci, marke/icons/ui/), Lucide 1.31.0, ISC.
import { symbol } from "@/components/symbol";

${zeilen.join("\n")}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ci = process.argv.indexOf("--ci");
  if (ci > 0) {
    for (const name of new Set(Object.values(NAMEN))) {
      copyFileSync(join(process.argv[ci + 1], "marke", "icons", "ui", `${name}.svg`), join(frontend, "symbole", `${name}.svg`));
    }
  }
  const datei = join(frontend, "lib", "symbole.tsx");
  if (process.argv.includes("--pruefen")) {
    const fehler = [];
    if (readFileSync(datei, "utf8") !== erzeugen()) fehler.push("lib/symbole.tsx ist nicht aus symbole/ erzeugt");
    const benutzt = new Set(Object.values(NAMEN));
    for (const f of readdirSync(join(frontend, "symbole"))) {
      if (f.endsWith(".svg") && !benutzt.has(f.slice(0, -4))) fehler.push(`symbole/${f} wird nicht benutzt`);
    }
    for (const f of fehler) console.error(f);
    process.exit(fehler.length ? 1 : 0);
  }
  writeFileSync(datei, erzeugen());
  console.log(`lib/symbole.tsx: ${Object.keys(NAMEN).length} Zeichen`);
}
