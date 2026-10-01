import { describe, expect, it } from "vitest";
import { tabTitel } from "@/components/tab-titel";

describe("Tab-Titel", () => {
  it("nennt zuerst die Seite, dann die Anwendung", () => {
    expect(tabTitel("Firmen")).toBe("Firmen · Rocket");
    expect(tabTitel("Krüger Logistik")).toBe("Krüger Logistik · Rocket");
  });
  it("ohne Seite nur die Anwendung", () => {
    expect(tabTitel("")).toBe("Rocket");
    expect(tabTitel(undefined)).toBe("Rocket");
  });
});
