import { describe, expect, it } from "vitest";
import { alsEingabe, anzeige, ausEingabe, Eingabefehler, istLeer, patchFuer, sichereUrl, waehlbar, wertVon } from "@/lib/feldwerte";
import type { Feldeintrag } from "@/lib/typen";

function feld(art: string, extra: Partial<Feldeintrag> = {}): Feldeintrag {
  return {
    id: art, key: art, label: art.toUpperCase(), description: null, is_system: true, art,
    bearbeitbar: true, options: [], required: false, im_anlegen: false, is_active: true, anzahl: null, ...extra,
  };
}

describe("Feldwerte", () => {
  it("erkennt Leere, auch die leere Liste", () => {
    expect([null, undefined, "", []].every(istLeer)).toBe(true);
    expect([0, false, "x", ["a"]].some(istLeer)).toBe(false);
  });

  it("rechnet Beträge in Cent, ohne zu runden, was nicht zu runden ist", () => {
    const f = feld("currency");
    expect(ausEingabe(f, "1.234,56")).toBe(123456);
    expect(ausEingabe(f, "19,99 €")).toBe(1999);
    expect(ausEingabe(f, "0,1")).toBe(10);
    expect(alsEingabe(f, 123456)).toBe("1234,56");
    expect(() => ausEingabe(f, "viel")).toThrow(Eingabefehler);
    expect(() => ausEingabe(f, "-5")).toThrow(Eingabefehler);
  });

  it("leer heißt null, auch bei der Mehrfachauswahl", () => {
    expect(ausEingabe(feld("text"), "  ")).toBeNull();
    expect(ausEingabe(feld("multiselect"), [])).toBeNull();
    expect(ausEingabe(feld("bool"), "false")).toBe(false);
    expect(ausEingabe(feld("number"), "2,5")).toBe(2.5);
  });

  it("öffnet nur http und https", () => {
    expect(sichereUrl("https://aimighty.de")).toBe("https://aimighty.de");
    expect(sichereUrl("aimighty.de/kontakt")).toBe("https://aimighty.de/kontakt");
    expect(sichereUrl("javascript:alert(1)")).toBeNull();
    expect(sichereUrl("data:text/html,x")).toBeNull();
  });

  it("zeigt Auswahl, Personen und Ja/Nein als Text", () => {
    const stufe = feld("select", { options: [{ wert: "lead", text: "Kontakt", verborgen: false }] });
    expect(anzeige(stufe, "lead")).toBe("Kontakt");
    expect(anzeige(feld("user"), "u1", [{ wert: "u1", text: "Marc" }])).toBe("Marc");
    expect(anzeige(feld("bool"), false)).toBe("Nein");
    expect(anzeige(feld("text"), null)).toBe("—");
  });

  it("bietet Archiviertes nur an, wenn es schon gesetzt ist", () => {
    const o = [{ wert: "a", text: "A", verborgen: false }, { wert: "b", text: "B", verborgen: true }];
    expect(waehlbar(o, "a").map((x) => x.wert)).toEqual(["a"]);
    expect(waehlbar(o, "b").map((x) => x.text)).toEqual(["A", "B (archiviert)"]);
  });

  it("legt feste Felder oben, eigene in custom ab", () => {
    const stadt = feld("text", { key: "city" });
    const raum = feld("bool", { key: "serverraum", is_system: false });
    expect(patchFuer([{ feld: stadt, wert: "Köln" }, { feld: raum, wert: true }])).toEqual({
      city: "Köln",
      custom: { serverraum: true },
    });
    expect(patchFuer([{ feld: stadt, wert: null }])).toEqual({ city: null });
    expect(wertVon(raum, { custom: { serverraum: true } })).toBe(true);
    expect(wertVon(stadt, { city: "Köln" })).toBe("Köln");
  });
});
