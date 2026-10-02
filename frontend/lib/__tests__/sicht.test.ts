import { describe, expect, it } from "vitest";
import { aufzaehlung, sichtSatz } from "@/lib/sicht";

describe("Sicht in Klartext", () => {
  it("zählt auf wie ein Mensch", () => {
    expect(aufzaehlung([])).toBe("");
    expect(aufzaehlung(["A"])).toBe("A");
    expect(aufzaehlung(["A", "B"])).toBe("A und B");
    expect(aufzaehlung(["A", "B", "C"])).toBe("A, B und C");
  });

  it("sagt, was gilt", () => {
    expect(sichtSatz("Max", "alles", [])).toBe("Max sieht alle Firmen und Kontakte.");
    expect(sichtSatz("Max", "eingeschraenkt", [])).toBe("Max sieht keine Kontakte, nur die Namen der Firmen.");
    expect(
      sichtSatz("Max", "eingeschraenkt", [
        { name: "1. Herren", bereich: false, stufe: "bearbeiten" },
        { name: "Jugend", bereich: true, stufe: "bearbeiten" },
      ]),
    ).toBe("Max sieht die Kontakte von 1. Herren und Bereich Jugend und kann sie bearbeiten.");
    expect(sichtSatz("Eva", "eingeschraenkt", [{ name: "2. Herren", bereich: false, stufe: "lesen" }])).toBe(
      "Eva sieht die Kontakte von 2. Herren, nur lesend.",
    );
    expect(
      sichtSatz("Eva", "eingeschraenkt", [
        { name: "1. Herren", bereich: false, stufe: "bearbeiten" },
        { name: "2. Herren", bereich: false, stufe: "lesen" },
      ]),
    ).toBe("Eva sieht die Kontakte von 1. Herren und 2. Herren; nur lesend bei 2. Herren.");
  });

  it("nennt vertrauliche Felder, wenn danach gefragt ist", () => {
    expect(sichtSatz("Kim", "alles", [], true)).toBe("Kim sieht alle Firmen und Kontakte. Vertrauliche Felder auch.");
    expect(sichtSatz("Kim", "alles", [], false)).toBe("Kim sieht alle Firmen und Kontakte. Vertrauliche Felder nicht.");
  });
});
