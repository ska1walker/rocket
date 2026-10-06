import { describe, expect, it } from "vitest";
import { begriffe } from "@/lib/begriffe";
import {
  ALLE_ZIELE,
  EINGESCHRAENKT_OFFEN,
  LEISTE_EINGESCHRAENKT,
  LEISTE_VEREIN,
  gruppenFuer,
  offenFuerEingeschraenkt,
  GRUPPEN,
  LEISTE_STANDARD,
  MOBIL_STANDARD,
  leisteZiele,
  favoritUmschalten,
  favoritenZiele,
  istAktiv,
  mobilRest,
  mobilZiele,
} from "@/lib/navigation";

describe("Navigation", () => {
  it("führt alle vierzehn Ziele genau einmal in vier Gruppen", () => {
    expect(GRUPPEN.map((g) => g.titel)).toEqual(["Verkauf", "Bestand", "Post", "Wissen"]);
    const pfade = ALLE_ZIELE.map((z) => z.pfad);
    expect(pfade).toHaveLength(14);
    expect(new Set(pfade).size).toBe(14);
    expect(pfade).not.toContain("/einstellungen");
  });

  it("erkennt den aktiven Eintrag", () => {
    expect(istAktiv("/", "/")).toBe(true);
    expect(istAktiv("/", "/deals")).toBe(false);
    expect(istAktiv("/deals", "/deals/123")).toBe(true);
    expect(istAktiv("/deals", "/dealsx")).toBe(false);
  });

  it("hält die Reihenfolge der Favoriten und lässt Unbekanntes weg — auch ein altes Lesezeichen auf die Einstellungen", () => {
    expect(favoritenZiele(["/kontakte", "/nix", "/firmen", "/kontakte", "/einstellungen"]).map((z) => z.pfad)).toEqual([
      "/kontakte",
      "/firmen",
    ]);
  });

  it("zeigt links die Vorgabe, bis das erste Lesezeichen sie ersetzt", () => {
    expect(leisteZiele([]).map((z) => z.pfad)).toEqual(LEISTE_STANDARD);
    expect(LEISTE_STANDARD).toHaveLength(6);
    // Ein einziges Lesezeichen genügt — die Vorgabe verschwindet ganz.
    expect(leisteZiele(["/erkenntnisse"]).map((z) => z.pfad)).toEqual(["/erkenntnisse"]);
    // Nur Unbekanntes zählt wie nichts.
    expect(leisteZiele(["/nix"]).map((z) => z.pfad)).toEqual(LEISTE_STANDARD);
    expect(leisteZiele(["/kontakte", "/", "/kontakte"]).map((z) => z.pfad)).toEqual(["/kontakte", "/"]);
  });

  it("schaltet einen Favoriten um", () => {
    expect(favoritUmschalten([], "/firmen")).toEqual(["/firmen"]);
    expect(favoritUmschalten(["/firmen", "/deals"], "/firmen")).toEqual(["/deals"]);
    expect(favoritUmschalten(["/deals"], "/firmen")).toEqual(["/deals", "/firmen"]);
  });

  it("zeigt unten Favoriten, füllt aus der Vorgabe auf, der Rest ist disjunkt", () => {
    expect(mobilZiele([]).map((z) => z.pfad)).toEqual(MOBIL_STANDARD);
    expect(mobilZiele(["/kontakte"]).map((z) => z.pfad)).toEqual(["/kontakte", "/", "/deals", "/firmen"]);
    expect(mobilZiele(["/tickets", "/kampagnen", "/listen", "/fragen", "/firmen"]).map((z) => z.pfad)).toEqual([
      "/tickets",
      "/kampagnen",
      "/listen",
      "/fragen",
    ]);
    const unten = new Set(mobilZiele([]).map((z) => z.pfad));
    const rest = mobilRest([]).map((z) => z.pfad);
    expect(rest.some((p) => unten.has(p))).toBe(false);
    // Die Einstellungen stehen im Profil oben rechts, nicht unter „Mehr“ (CI G8).
    expect(rest).not.toContain("/einstellungen");
    expect(unten.size + rest.length).toBe(14);
  });
});

describe("eingeschränkte Sicht", () => {
  it("zeigt nur, was der Server auch öffnet", () => {
    expect(leisteZiele([], true).map((z) => z.pfad)).toEqual(LEISTE_EINGESCHRAENKT);
    expect(leisteZiele(["/deals", "/kontakte"], true).map((z) => z.pfad)).toEqual(["/kontakte"]);
    // Nur verschlossene Favoriten: dann die Vorgabe, nicht eine leere Leiste.
    expect(leisteZiele(["/deals"], true).map((z) => z.pfad)).toEqual(LEISTE_EINGESCHRAENKT);
    for (const z of [...mobilZiele(["/", "/prognose"], true), ...mobilRest([], true)]) {
      expect(EINGESCHRAENKT_OFFEN).toContain(z.pfad);
    }
    const mehr = gruppenFuer(true).flatMap((g) => g.ziele.map((z) => z.pfad));
    expect(mehr).not.toContain("/");
    expect(mehr).not.toContain("/deals");
    expect(gruppenFuer(true).every((g) => g.ziele.length > 0)).toBe(true);
  });

  it("öffnet Unterseiten, aber keine Nachbarn mit gleichem Anfang", () => {
    expect(offenFuerEingeschraenkt("/kontakte/123")).toBe(true);
    expect(offenFuerEingeschraenkt("/")).toBe(false);
    expect(offenFuerEingeschraenkt("/deals/1")).toBe(false);
    expect(offenFuerEingeschraenkt("/listenx")).toBe(false);
  });

  it("ändert für volle Sicht nichts", () => {
    expect(gruppenFuer(false)).toEqual(GRUPPEN);
  });
});

describe("Modus Verein", () => {
  const verein = begriffe("verein");

  it("nennt Firmen Mannschaften und lässt den Vertrieb weg", () => {
    const leiste = leisteZiele([], false, verein);
    expect(leiste.map((z) => z.pfad)).toEqual(LEISTE_VEREIN);
    expect(leiste.find((z) => z.pfad === "/firmen")?.text).toBe("Mannschaften");
    expect(leiste.find((z) => z.pfad === "/kontakte")?.text).toBe("Personen");
    expect(leiste.find((z) => z.pfad === "/kampagnen")?.text).toBe("Rundmails");
    const alle = [...gruppenFuer(false, verein).flatMap((g) => g.ziele), ...mobilZiele([], false, verein), ...mobilRest([], false, verein)];
    for (const pfad of ["/", "/deals", "/angebote", "/prognose"]) {
      expect(alle.map((z) => z.pfad)).not.toContain(pfad);
    }
    expect(gruppenFuer(false, verein).map((g) => g.titel)).toEqual(["Alltag", "Verein", "Post", "Wissen"]);
  });

  it("lässt gemerkte Leads weg, statt sie zu zeigen", () => {
    expect(leisteZiele(["/deals", "/firmen"], false, verein).map((z) => z.pfad)).toEqual(["/firmen"]);
  });

  it("verbindet sich mit eingeschränkter Sicht", () => {
    for (const z of mobilRest([], true, verein)) expect(EINGESCHRAENKT_OFFEN).toContain(z.pfad);
    expect(leisteZiele([], true, verein).find((z) => z.pfad === "/firmen")?.text).toBe("Mannschaften");
  });
});
