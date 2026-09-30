import { describe, expect, it } from "vitest";
import { nachbarspalte, naechsterPlatz } from "@/lib/tasten";

const t = (key: string, alt = true) => ({ key, altKey: alt, ctrlKey: false, metaKey: false, shiftKey: false });

describe("nachbarspalte", () => {
  it("schiebt mit Alt und Pfeil in die Nachbarspalte", () => {
    expect(nachbarspalte(t("ArrowRight"), 0, 3)).toBe(1);
    expect(nachbarspalte(t("ArrowLeft"), 2, 3)).toBe(1);
  });

  it("bleibt am Rand stehen, statt herumzuspringen", () => {
    expect(nachbarspalte(t("ArrowRight"), 2, 3)).toBeNull();
    expect(nachbarspalte(t("ArrowLeft"), 0, 3)).toBeNull();
  });

  it("lässt die Pfeile ohne Alt der Seite", () => {
    expect(nachbarspalte(t("ArrowRight", false), 0, 3)).toBeNull();
    expect(nachbarspalte({ ...t("ArrowRight"), shiftKey: true }, 0, 3)).toBeNull();
    expect(nachbarspalte(t("Enter"), 0, 3)).toBeNull();
  });
});

describe("naechsterPlatz", () => {
  it("wandert im Kreis", () => {
    expect(naechsterPlatz("ArrowRight", 2, 3, "waagerecht")).toBe(0);
    expect(naechsterPlatz("ArrowLeft", 0, 3, "waagerecht")).toBe(2);
    expect(naechsterPlatz("ArrowDown", 0, 3, "senkrecht")).toBe(1);
    expect(naechsterPlatz("ArrowUp", 0, 3, "senkrecht")).toBe(2);
  });

  it("springt mit Pos1 und Ende an den Rand", () => {
    expect(naechsterPlatz("Home", 2, 3, "waagerecht")).toBe(0);
    expect(naechsterPlatz("End", 0, 3, "senkrecht")).toBe(2);
  });

  it("kennt nur Pfeile seiner Richtung", () => {
    expect(naechsterPlatz("ArrowDown", 0, 3, "waagerecht")).toBeNull();
    expect(naechsterPlatz("ArrowRight", 0, 3, "senkrecht")).toBeNull();
    expect(naechsterPlatz("ArrowRight", 0, 0, "waagerecht")).toBeNull();
  });
});
