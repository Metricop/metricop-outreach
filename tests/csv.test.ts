import { describe, expect, it } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("toCsv", () => {
  const cols = [
    { header: "Firma", value: (r: { a: string | null; t: string[]; ok: boolean }) => r.a },
    { header: "Oznake", value: (r: { a: string | null; t: string[]; ok: boolean }) => r.t },
    { header: "Kupac", value: (r: { a: string | null; t: string[]; ok: boolean }) => r.ok },
  ];

  it("počinje BOM-om i koristi tačku-zarez", () => {
    const out = toCsv([{ a: "Geo Biro", t: ["sajam", "2026"], ok: false }], cols);
    expect(out.startsWith("﻿Firma;Oznake;Kupac\r\n")).toBe(true);
    expect(out).toContain("Geo Biro;sajam, 2026;ne\r\n");
  });

  it("stavlja navodnike oko vrednosti sa razdvajačem, navodnikom ili novim redom", () => {
    const out = toCsv([{ a: 'A; "B"\nC', t: [], ok: true }], cols);
    expect(out).toContain('"A; ""B""\nC";;da');
  });

  it("prazno za null", () => {
    expect(toCsv([{ a: null, t: [], ok: true }], cols)).toContain("\r\n;;da\r\n");
  });
});
