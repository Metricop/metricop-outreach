import { describe, expect, it } from "vitest";
import { checkImportRows, guessMapping, parseTags } from "../../supabase/functions/_shared/logic/importRows.ts";

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
      {
        rowNumber: 2,
        email: "info@geoplan.rs",
        company: "Geo Plan",
        first_name: undefined,
        last_name: undefined,
        title: undefined,
        phone: undefined,
        city: "Novi Sad",
        personalization: undefined,
        source: undefined,
        external_ref: undefined,
        linkedin_url: undefined,
        tags: [],
      },
    ]);
  });

  it("preskače postojeće kupce iz glavne aplikacije, sa razlogom", () => {
    const r = checkImportRows(
      [{ email: "nabavka@kupac.se" }, { email: "novi@firma.se", tags: "Sajam, partner; sajam" }],
      new Set(),
      suppression,
      new Map([["nabavka@kupac.se", "Postojeći kupac (Kupac AB)"]]),
    );
    expect(r.skipped).toEqual([{ rowNumber: 2, email: "nabavka@kupac.se", reason: "crm_blocked", detail: "Postojeći kupac (Kupac AB)" }]);
    expect(r.valid[0].tags).toEqual(["sajam", "partner"]);
  });

  it("parseTags razdvaja zarezom, tačka-zarezom i uspravnom crtom", () => {
    expect(parseTags(" A | b; c ,, a ")).toEqual(["a", "b", "c"]);
    expect(parseTags(undefined)).toEqual([]);
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
