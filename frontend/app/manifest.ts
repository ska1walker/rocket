import type { MetadataRoute } from "next";

// Das Web-App-Manifest: Name und Symbol für „Zum Home-Bildschirm" und die
// Installation im Browser. Die Symbole entstehen aus docs/icon/rocket.svg
// (scripts/app-symbole.mjs) — nie ein anderes Bild, nie ein Platzhalter.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rocket — Vertrieb",
    short_name: "Rocket",
    description: "AI-gestütztes CRM für den AImighty-Vertrieb. Läuft auf der eigenen Box.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#051729",
    theme_color: "#051729",
    icons: [
      { src: "/symbol/rocket-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/symbol/rocket-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/symbol/rocket-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
