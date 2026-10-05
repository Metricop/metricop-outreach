import { describe, expect, it } from "vitest";
import { countLinks, lintStep } from "@logic/templateLint.ts";

const ok = "Zdravo {{ime}},\n\nTekst.\n\nAko ne želite da vam pišemo, samo odgovorite i nećemo se više javljati.";

describe("lintStep", () => {
  it("ispravan prvi korak nema upozorenja", () => {
    expect(lintStep({ stepNo: 1, subject: "Saradnja", body: ok })).toEqual([]);
  });
  it("prvi korak bez odjave i bez naslova", () => {
    const w = lintStep({ stepNo: 1, subject: "", body: "Zdravo." });
    expect(w.some((x) => x.includes("naslov"))).toBe(true);
    expect(w.some((x) => x.includes("odjavu"))).toBe(true);
  });
  it("follow-up ne mora da ima odjavu ni naslov", () => {
    expect(lintStep({ stepNo: 2, subject: null, body: "Samo da proverim." })).toEqual([]);
  });
  it("švedska rečenica za odjavu se prepoznaje", () => {
    expect(lintStep({ stepNo: 1, subject: "Hej", body: "Hej!\nOm du inte vill få fler mejl, svara bara." })).toEqual([]);
  });
  it("više od jednog linka, računajući potpis", () => {
    const w = lintStep({ stepNo: 2, subject: null, body: "Pogledajte https://metricop.com/a", signature: "www.metricop.com" });
    expect(w[0]).toContain("2 linka");
  });
  it("slike i nepoznata polja", () => {
    const w = lintStep({ stepNo: 2, subject: null, body: '<img src="x"> {{prezime}} {{ ime }}' });
    expect(w.some((x) => x.includes("Slike"))).toBe(true);
    expect(w.some((x) => x.includes("{{prezime}}"))).toBe(true);
    expect(w.some((x) => x.startsWith("Nepoznato polje {{ime}}"))).toBe(false);
  });
});

describe("countLinks", () => {
  it("broji http i www linkove", () => {
    expect(countLinks("a https://x.rs b www.y.se c")).toBe(2);
    expect(countLinks("bez linkova")).toBe(0);
  });
});
