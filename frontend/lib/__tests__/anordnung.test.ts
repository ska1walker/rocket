import { describe, expect, it } from "vitest";
import { ablageOrt, alsReihenfolge, finde, fuerSicht, gruppieren, gruppeSchieben, passt, schritt, verschiebe } from "@/lib/anordnung";
import type { Anordnung, Feldeintrag } from "@/lib/typen";

function feld(id: string): Feldeintrag {
  return {
    id, key: id, label: id.toUpperCase(), description: null, is_system: false, art: "text",
    bearbeitbar: true, options: [], required: false, im_anlegen: false, is_active: true, anzahl: null,
  };
}

const A: Anordnung = {
  entity: "companies",
  archiviert: [],
  gruppen: [
    { id: "g1", key: "g1", label: "Eins", position: 10, is_system: true, felder: [feld("a"), feld("b")] },
    { id: "g2", key: "g2", label: "Zwei", position: 20, is_system: true, felder: [] },
    { id: "g3", key: "g3", label: "Drei", position: 30, is_system: false, felder: [feld("c")] },
  ],
};

const ids = (a: Anordnung) => a.gruppen.map((g) => g.felder.map((f) => f.id));

describe("Anordnung", () => {
  it("verschiebt zwischen Gruppen und lässt das Original unberührt", () => {
    const neu = verschiebe(A, "a", { gruppe: "g3", index: 1 });
    expect(ids(neu)).toEqual([["b"], [], ["c", "a"]]);
    expect(ids(A)).toEqual([["a", "b"], [], ["c"]]);
  });

  it("hängt bei zu großem Index hinten an", () => {
    expect(ids(verschiebe(A, "a", { gruppe: "g2", index: 99 }))).toEqual([["b"], ["a"], ["c"]]);
  });

  it("ordnet innerhalb einer Gruppe", () => {
    expect(ids(verschiebe(A, "b", { gruppe: "g1", index: 0 }))).toEqual([["b", "a"], [], ["c"]]);
  });

  it("geht mit der Tastatur über Gruppengrenzen — auch durch leere", () => {
    let a = schritt(A, "b", 1);
    expect(ids(a)).toEqual([["a"], ["b"], ["c"]]);
    a = schritt(a, "b", 1);
    expect(ids(a)).toEqual([["a"], [], ["b", "c"]]);
    a = schritt(a, "b", -1);
    expect(ids(a)).toEqual([["a"], ["b"], ["c"]]);
    // Ganz oben bleibt es stehen.
    expect(schritt(A, "a", -1)).toBe(A);
    expect(schritt(A, "c", 1)).toBe(A);
  });

  it("schiebt Gruppen und findet Felder", () => {
    expect(gruppeSchieben(A, "g3", -1).gruppen.map((g) => g.id)).toEqual(["g1", "g3", "g2"]);
    expect(gruppeSchieben(A, "g1", -1)).toBe(A);
    expect(finde(A, "c")).toEqual({ gruppe: "g3", index: 0 });
    expect(finde(A, "x")).toBeNull();
  });

  it("legt beim Ziehen nach unten vor das Zielfeld, nicht dahinter", () => {
    const B = verschiebe(A, "c", { gruppe: "g1", index: 2 }); // g1: a, b, c
    // a auf c ziehen heißt: vor c — also zwischen b und c.
    const neu = verschiebe(B, "a", ablageOrt(B, "a", { gruppe: "g1", index: 2 }));
    expect(ids(neu)[0]).toEqual(["b", "a", "c"]);
    // Nach oben und in andere Gruppen bleibt der Index, wie er ist.
    expect(ablageOrt(B, "c", { gruppe: "g1", index: 0 })).toEqual({ gruppe: "g1", index: 0 });
    expect(ablageOrt(B, "a", { gruppe: "g2", index: 0 })).toEqual({ gruppe: "g2", index: 0 });
  });

  it("baut die Form für den Server", () => {
    expect(alsReihenfolge(A)).toEqual({
      entity: "companies",
      gruppen: [{ id: "g1", felder: ["a", "b"] }, { id: "g2", felder: [] }, { id: "g3", felder: ["c"] }],
    });
  });

  it("gruppiert in der gelieferten Reihenfolge", () => {
    const g = gruppieren([
      { k: "a", gruppe: "Eins" }, { k: "b", gruppe: "Zwei" }, { k: "c", gruppe: "Eins" }, { k: "d" },
    ]);
    expect(g.map((x) => [x.gruppe, x.felder.map((f) => f.k)])).toEqual([
      ["Eins", ["a", "c"]], ["Zwei", ["b"]], [null, ["d"]],
    ]);
  });

  it("sucht in Beschriftung und Schlüssel", () => {
    expect(passt("", "Ort", "city")).toBe(true);
    expect(passt("ci", "Ort", "city")).toBe(true);
    expect(passt("or", "Ort", "city")).toBe(true);
    expect(passt("plz", "Ort", "city")).toBe(false);
  });

  it("blendet vertrauliche Gruppen aus, wer sie nicht sehen darf", () => {
    const geheim: Anordnung = {
      ...A,
      gruppen: A.gruppen.map((g) => (g.id === "g3" ? { ...g, vertraulich: true } : g)),
      archiviert: [{ ...feld("x"), is_active: false, vertraulich: true }, { ...feld("y"), is_active: false }],
    };
    expect(fuerSicht(geheim, true)).toBe(geheim);
    const ohne = fuerSicht(geheim, false);
    expect(ohne.gruppen.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(ohne.archiviert.map((f) => f.id)).toEqual(["y"]);
  });
});
