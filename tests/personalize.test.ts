import { describe, expect, it } from "vitest";
import { parseSuggestions, systemPrompt, userContent } from "@/lib/personalize";

describe("personalizacija", () => {
  it("uputstvo zabranjuje izmišljanje i traži prazno kad nema podataka", () => {
    const p = systemPrompt("sr");
    expect(p).toContain("Ne izmišljaj");
    expect(p).toContain("prazan string");
    expect(p).toContain("latinica");
    expect(p).toContain("licence za rad RGZ");
    expect(systemPrompt("sv")).toContain("švedskom");
  });

  it("šalje samo naziv, grad, izvor i beleške", () => {
    const c = JSON.parse(userContent([{ id: "1", company: "Geo Plan", city: "Niš", source: null, notes: "Radi katastar" }]));
    expect(c).toEqual([
      { id: "1", naziv: "Geo Plan", grad: "Niš", izvor: "", beleske: "Radi katastar", sajt: "", opis_firme: "", licence: "" },
    ]);
  });

  it("uputstvo traži delatnost i prazno kad se ne vidi", () => {
    const p = systemPrompt("sv");
    for (const s of ["survey", "contractor", "municipality", "monitoring", "scanning"]) expect(p).toContain(`- ${s}:`);
    expect(p).toContain("Ne pogađaj");
  });

  it("čita predloge, ignoriše nepoznate id-jeve i čisti razmake", () => {
    const text = JSON.stringify({
      suggestions: [
        { id: "a", sentence: "  Videli smo da radite   katastar u Nišu. ", segment: "survey" },
        { id: "x", sentence: "nije traženo", segment: "survey" },
        { id: "b", sentence: "", segment: "" },
        { id: "c", sentence: "Skenirate tunele.", segment: "nesto" },
      ],
    });
    expect(parseSuggestions(text, ["a", "b", "c", "d"])).toEqual({
      a: { sentence: "Videli smo da radite katastar u Nišu.", segment: "survey" },
      b: { sentence: "", segment: null },
      c: { sentence: "Skenirate tunele.", segment: null },
      d: { sentence: "", segment: null },
    });
  });

  it("neispravan JSON baca grešku", () => {
    expect(() => parseSuggestions("nije json", ["a"])).toThrow();
  });
});
