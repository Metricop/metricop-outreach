import { describe, expect, it } from "vitest";
import { checkImportRows, guessMapping } from "../../supabase/functions/_shared/logic/importRows.ts";

const suppression = { emails: new Set(["odjavljen@firma.rs"]), domains: new Set(["blokiran.rs"]) };

describe("checkImportRows", () => {
  it("propušta ispravne redove i normalizuje email", () => {
    const r = checkImportRows(
      [{ email: "  Info@GeoPlan.rs ", company: " Geo  Plan ", city: "Novi Sad", first_name: "" }],
      new Set(),
      suppression,
    );
    expect(r.skipped).toEqual([]);
    expect(r.valid).toEqual([
      { rowNumber: 2, email: "info@geoplan.rs", company: "Geo Plan", first_name: undefined, city: "Novi Sad", personalization: undefined, source: undefined },
    ]);
  });

  it("preskače neispravne, duplikate i izuzete, sa brojem reda", () => {
    const r = checkImportRows(
      [
        { email: "dobar@geo.rs" },
        { email: "nije-email" },
        { email: "DOBAR@geo.rs" },
        { email: "postoji@geo.rs" },
        { email: "odjavljen@firma.rs" },
        { email: "bilo.ko@blokiran.rs" },
        { email: "" },
      ],
      new Set(["postoji@geo.rs"]),
      suppression,
    );
    expect(r.valid.map((v) => v.email)).toEqual(["dobar@geo.rs"]);
    expect(r.skipped.map((s) => [s.rowNumber, s.reason])).toEqual([
      [3, "invalid_email"],
      [4, "duplicate_in_file"],
      [5, "duplicate_in_db"],
      [6, "suppressed_email"],
      [7, "suppressed_domain"],
      [8, "invalid_email"],
    ]);
  });

  it("lista za izuzimanje ima prednost nad duplikatom u bazi", () => {
    const r = checkImportRows([{ email: "odjavljen@firma.rs" }], new Set(["odjavljen@firma.rs"]), suppression);
    expect(r.skipped[0].reason).toBe("suppressed_email");
  });
});

describe("guessMapping", () => {
  it("prepoznaje uobičajene nazive kolona", () => {
    expect(guessMapping(["Firma", "Ime", "E-mail", "Grad", "Napomena", "Izvor"])).toEqual({
      company: 0,
      first_name: 1,
      email: 2,
      city: 3,
      source: 5,
    });
    expect(guessMapping(["Company", "First name", "Email", "City"])).toMatchObject({ company: 0, first_name: 1, email: 2, city: 3 });
  });
});
