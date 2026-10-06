import { describe, expect, it } from "vitest";
import { begriffe } from "@/lib/begriffe";
import { einstellungenFinden } from "@/lib/einstellungen";

// Die Einstellungen stehen seit 26.10.22 nur im Profil oben rechts; die
// Suche in der Kopfleiste findet ihre Bereiche trotzdem.
describe("einstellungenFinden", () => {
  const vertrieb = begriffe("vertrieb");

  it("findet nach Name und Beschreibung", () => {
    expect(einstellungenFinden("passwort", vertrieb, true).map((e) => e.pfad)).toEqual(["/einstellungen?bereich=sicherheit"]);
    expect(einstellungenFinden("Eigensch", vertrieb, true)[0].pfad).toBe("/einstellungen?bereich=eigenschaften");
  });

  it("zeigt auf „Einstellungen“ die ersten Bereiche", () => {
    expect(einstellungenFinden("einst", vertrieb, true).length).toBe(4);
  });

  it("zeigt die Organisation nur, wer verwaltet", () => {
    expect(einstellungenFinden("eigenschaften", vertrieb, false)).toEqual([]);
    expect(einstellungenFinden("darstellung", vertrieb, false).map((e) => e.titel)).toEqual(["Darstellung"]);
  });

  it("ein Buchstabe ist noch keine Suche; im Verein fehlt „Vertrieb“", () => {
    expect(einstellungenFinden("p", vertrieb, true)).toEqual([]);
    expect(einstellungenFinden("pipelines", begriffe("verein"), true)).toEqual([]);
  });
});
