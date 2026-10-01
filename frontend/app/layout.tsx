import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DARSTELLUNG_SCRIPT, DICHTE_SCRIPT } from "@/components/darstellung";
import { NAVIGATION_SCRIPT } from "@/components/navigation";
import { Huelle } from "@/components/huelle";
import { Abfrageanbieter } from "@/components/abfrageanbieter";
import { Fehlermelder } from "@/components/fehlermelder";
import "./globals.css";

// Geist aus dem Repo, nicht vom Google-CDN — auch nicht zur Bauzeit. Das
// ist keine Vorliebe: AImighty verkauft, dass nichts das Haus verlässt,
// und eine Schriftanfrage an einen fremden Server wäre genau das.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Im Tab steht zuerst die Seite (components/tab-titel.tsx); ohne Seitenkopf
  // nur der Name der Anwendung.
  title: "Rocket",
  description: "AI-gestütztes CRM für den AImighty-Vertrieb. Läuft auf der eigenen Box.",
  // Symbole bewusst nicht über die Metadaten (app/icon.*): Dann rendert Next
  // eine Marke <meta name="«nxt-icon»">, die es nur entfernt, wenn sie in
  // einem Stück des Datenstroms liegt. Fällt eine Stückgrenze hinein, bleibt
  // sie stehen und der Browser meldet React #418 (BETRIEB.md, „#418“). Die
  // Link-Tags stehen deshalb unten im <head>. Unter dem Symbol auf dem
  // Home-Bildschirm steht „Rocket".
  appleWebApp: { title: "Rocket" },
};

export const viewport: Viewport = {
  themeColor: "#051729",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Setzt die Klasse `dunkel` vor dem ersten Anstrich — sonst
            blitzt bei dunkler Einstellung kurz die helle Fläche auf. */}
        <script dangerouslySetInnerHTML={{ __html: DARSTELLUNG_SCRIPT }} />
        {/* Dasselbe für die eingeklappte Navigation — sonst springt die
            Leiste beim Laden von breit auf schmal. */}
        <script dangerouslySetInnerHTML={{ __html: NAVIGATION_SCRIPT }} />
        {/* Und für die Dichte (Weit/Normal/Kompakt) — sonst rückt die Seite
            nach dem Laden zusammen. */}
        <script dangerouslySetInnerHTML={{ __html: DICHTE_SCRIPT }} />
        {/* Im Tab nur die Rakete (SVG folgt der Tableiste, PNG für Safari),
            auf dem Home-Bildschirm die volle Kachel — aus
            scripts/app-symbole.mjs. */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any" />
        <link rel="icon" href="/icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" type="image/png" sizes="180x180" />
      </head>
      <body>
        <Fehlermelder />
        <Abfrageanbieter>
          <Huelle>{children}</Huelle>
        </Abfrageanbieter>
      </body>
    </html>
  );
}
