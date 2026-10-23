import { describe, expect, it } from "vitest";
import { buildTenderDigest, parseNotices, tedQuery } from "../../supabase/functions/_shared/logic/tenders.ts";

const notice = (no: string, type: string, deadline?: string) => ({
  "publication-number": no,
  "buyer-country": ["SWE"],
  "notice-title": { swe: "Sverige – Instrument för lantmäteri – Geodetiska mätinstrument", eng: "Sweden – Surveying" },
  "buyer-name": { swe: ["Kalmar kommun"] },
  "publication-date": "2025-07-07+02:00",
  "classification-cpv": ["38290000", "38290000"],
  "notice-type": type,
  ...(deadline ? { "deadline-receipt-tender-date-lot": [deadline] } : {}),
});

describe("tedQuery", () => {
  it("cela EU po CPV-u, Švedska još i po ključnim rečima", () => {
    const q = tedQuery("20261019");
    expect(q).toContain("(notice-type IN (cn-standard cn-social) AND classification-cpv IN");
    expect(q).toContain("buyer-country=SWE");
    expect(q).toContain("38296000");
    expect(q).toContain('"geodetisk mätutrustning"');
    expect(q).toContain("publication-date>=20261019");
  });
});

describe("parseNotices", () => {
  it("uzima švedski naslov, naručioca, rok i link", () => {
    const [t] = parseNotices({ notices: [notice("438954-2025", "cn-standard", "2025-09-08Z")] });
    expect(t).toEqual({
      publication_number: "438954-2025",
      country: "SWE",
      published_on: "2025-07-07",
      buyer: "Kalmar kommun",
      title: "Sverige – Instrument för lantmäteri – Geodetiska mätinstrument",
      notice_type: "cn-standard",
      cpv: "38290000",
      deadline: "2025-09-08",
      url: "https://ted.europa.eu/sv/notice/-/detail/438954-2025",
    });
  });
  it("van Švedske engleski naslov", () => {
    const [t] = parseNotices({ notices: [{ ...notice("1-2026", "cn-standard"), "buyer-country": ["DEU"] }] });
    expect(t.title).toBe("Sweden – Surveying");
  });
  it("prazan odgovor", () => {
    expect(parseNotices({})).toEqual([]);
  });
});

describe("buildTenderDigest", () => {
  it("bez novih objava nema mejla", () => {
    expect(buildTenderDigest("2026-10-26", [])).toBeNull();
  });
  it("razdvaja otvorene tendere, najave i dodele", () => {
    const ts = parseNotices({
      notices: [notice("1-2026", "cn-standard", "2026-11-20Z"), notice("2-2026", "pin-only"), notice("3-2026", "can-standard")],
    });
    const d = buildTenderDigest("2026-10-26", ts)!;
    expect(d.subject).toBe("[Tenderi EU] 1 otvoren tender za mernu opremu");
    expect(d.text).toContain("OTVORENI TENDERI (1):");
    expect(d.text).toContain("Švedska (1):");
    expect(d.text).toContain("rok za ponudu 2026-11-20");
    expect(d.text).toContain("NAJAVE I UPITI ZA INFORMACIJE (1):");
    expect(d.text).toContain("DODELJENI UGOVORI");
  });
  it("zemlje po abecedi, Švedska prva", () => {
    const ts = parseNotices({ notices: [notice("1-2026", "cn-standard"), notice("2-2026", "cn-standard"), notice("3-2026", "cn-standard")] });
    ts[0].country = "DEU";
    ts[1].country = "BEL";
    const t = buildTenderDigest("2026-10-26", ts)!.text;
    expect(t.indexOf("Švedska (1):")).toBeLessThan(t.indexOf("Belgija (1):"));
    expect(t.indexOf("Belgija (1):")).toBeLessThan(t.indexOf("Nemačka (1):"));
  });
  it("samo dodele: naslov broji objave", () => {
    const d = buildTenderDigest("2026-10-26", parseNotices({ notices: [notice("3-2026", "can-standard")] }))!;
    expect(d.subject).toBe("[Tenderi EU] 1 nova objava za mernu opremu");
  });
});
