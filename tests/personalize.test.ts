import { describe, expect, it } from "vitest";
import { parseSuggestions, systemPrompt, userContent } from "@/lib/personalize";

describe("personalizacija", () => {
  it("uputstvo zabranjuje izmišljanje i traži prazno kad nema podataka", () => {
    const p = systemPrompt("sr");
    expect(p).toContain("Ne izmišljaj");
    expect(p).toContain("prazan string");
    expect(p).toContain("latinica");
    expect(systemPrompt("sv")).toContain("švedskom");
  });

  it("šalje samo naziv, grad, izvor i beleške", () => {
    const c = JSON.parse(userContent([{ id: "1", company: "Geo Plan", city: "Niš", source: null, notes: "Radi katastar" }]));
    expect(c).toEqual([{ id: "1", naziv: "Geo Plan", grad: "Niš", izvor: "", beleske: "Radi katastar" }]);
  });

  it("čita predloge, ignoriše nepoznate id-jeve i čisti razmake", () => {
    const text = JSON.stringify({
      suggestions: [
        { id: "a", sentence: "  Videli smo da radite   katastar u Nišu. " },
        { id: "x", sentence: "nije traženo" },
        { id: "b", sentence: "" },
      ],
    });
    expect(parseSuggestions(text, ["a", "b", "c"])).toEqual({ a: "Videli smo da radite katastar u Nišu.", b: "", c: "" });
  });

  it("neispravan JSON baca grešku", () => {
    expect(() => parseSuggestions("nije json", ["a"])).toThrow();
  });
});
