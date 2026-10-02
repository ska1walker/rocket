import { describe, expect, it } from "vitest";
import { vorlagen } from "@/lib/vorlagen";

describe("Vorlagen", () => {
  it("bietet im Verein die Rollen des Vereins an", () => {
    expect(vorlagen("verein").map((v) => v.text)).toEqual([
      "Spartenleitung", "Vorstand", "Kassierer / Geschäftsstelle", "Jugendleiter", "Trainer", "Co-Trainer / Betreuer",
    ]);
  });

  it("gibt Vertrauliches nur, wer es braucht", () => {
    const v = Object.fromEntries(vorlagen("verein").map((x) => [x.schluessel, x]));
    expect(v.kassierer.vertraulich).toBe(true);
    expect(v.trainer.vertraulich).toBe(false);
    expect(v.trainer.sicht).toBe("eingeschraenkt");
    expect(v.betreuer.stufe).toBe("lesen");
    expect(v.vorstand.rolle).toBe("viewer");
  });

  it("lässt nie eine Verwaltung eingeschränkt sehen (der Server lehnte es ab)", () => {
    for (const v of [...vorlagen("verein"), ...vorlagen("vertrieb")]) {
      if (v.rolle === "admin") expect(v.sicht).toBe("alles");
    }
  });
});
