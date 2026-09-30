import { describe, expect, it } from "vitest";
import { fehlergrund } from "@/lib/api";

describe("fehlergrund", () => {
  it("nimmt einen Text aus dem Backend, wie er ist", () => {
    expect(fehlergrund("Nicht gefunden")).toBe("Nicht gefunden");
  });

  it("macht aus einem Prüffehler an der Adresse einen Satz", () => {
    // /angebote/abc: FastAPI prüft die UUID und antwortet 422.
    const detail = [{ loc: ["path", "quote_id"], msg: "Input should be a valid UUID", type: "uuid_parsing" }];
    expect(fehlergrund(detail)).toBe("Diese Adresse führt zu keinem Datensatz.");
  });

  it("nennt bei einem Prüffehler im Inhalt das Feld", () => {
    expect(fehlergrund([{ loc: ["body", "amount_cents"], msg: "…" }])).toBe("Eine Angabe passt nicht („amount_cents“).");
    expect(fehlergrund([{ loc: ["query", "limit"], msg: "…" }])).toBe("Eine Angabe passt nicht („limit“).");
    expect(fehlergrund([{ msg: "…" }])).toBe("Eine Angabe passt nicht.");
  });

  it("lässt den Statuscode stehen, wenn nichts Brauchbares kommt", () => {
    expect(fehlergrund(undefined)).toBeNull();
    expect(fehlergrund([])).toBeNull();
    expect(fehlergrund({ irgendwas: 1 })).toBeNull();
  });
});
