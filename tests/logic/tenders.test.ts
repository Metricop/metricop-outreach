import { describe, expect, it } from "vitest";
import { buildTenderDigest, parseNotices, tedQuery } from "../../supabase/functions/_shared/logic/tenders.ts";

const notice = (no: string, type: string, deadline?: string) => ({
  "publication-number": no,
  "notice-title": { swe: "Sverige – Instrument för lantmäteri – Geodetiska mätinstrument", eng: "Sweden – Surveying" },
  "buyer-name": { swe: ["Kalmar kommun"] },
  "publication-date": "2025-07-07+02:00",
  "classification-cpv": ["38290000", "38290000"],
  "notice-type": type,
  ...(deadline ? { "deadline-receipt-tender-date-lot": [deadline] } : {}),
});

describe("tedQuery", () => {
  it("Švedska, CPV za premer i datum", () => {
    const q = tedQuery("20261019");
    expect(q).toContain("buyer-country=SWE");
    expect(q).toContain("38296000");
    expect(q).toContain("publication-date>=20261019");
  });
});

describe("parseNotices", () => {
  it("uzima švedski naslov, naručioca, rok i link", () => {
    const [t] = parseNotices({ notices: [notice("438954-2025", "cn-standard", "2025-09-08Z")] });
    expect(t).toEqual({
      publication_number: "438954-2025",
      published_on: "2025-07-07",
      buyer: "Kalmar kommun",
      title: "Sverige – Instrument för lantmäteri – Geodetiska mätinstrument",
      notice_type: "cn-standard",
      cpv: "38290000",
      deadline: "2025-09-08",
      url: "https://ted.europa.eu/sv/notice/-/detail/438954-2025",
    });
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
    expect(d.subject).toBe("[Tenderi SE] 1 otvoren tender za mernu opremu");
    expect(d.text).toContain("OTVORENI TENDERI (1):");
    expect(d.text).toContain("rok za ponudu 2026-11-20");
    expect(d.text).toContain("NAJAVE I UPITI ZA INFORMACIJE (1):");
    expect(d.text).toContain("DODELJENI UGOVORI");
  });
  it("samo dodele: naslov broji objave", () => {
    const d = buildTenderDigest("2026-10-26", parseNotices({ notices: [notice("3-2026", "can-standard")] }))!;
    expect(d.subject).toBe("[Tenderi SE] 1 nova objava za mernu opremu");
  });
});
