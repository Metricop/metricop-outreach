import { describe, expect, it } from "vitest";
import { buildDailyReport } from "../../supabase/functions/_shared/logic/report.ts";

const sent = (group: string) => ({ type: "sent_step_1", detail: null, group, company: null, email: null, mailbox: null });

describe("buildDailyReport", () => {
  it("bez odbijenih nema izveštaja", () => {
    expect(buildDailyReport("2026-10-22", [sent("GEO-SRB")])).toBeNull();
  });
  it("javlja odbijene i blokirane, slanje ide dalje", () => {
    const r = buildDailyReport("2026-10-22", [
      sent("GEO-SRB"),
      sent("GEO-SRB"),
      { type: "bounce", detail: "Address not found", group: "GEO-SRB", company: "Firma", email: "a@b.rs", mailbox: null },
      { type: "blocked", detail: "Message blocked", group: "SE-INTRO", company: "Lunds kommun", email: "lund@lund.se", mailbox: null },
    ])!;
    expect(r.subject).toBe("[Outreach] 2026-10-22: 2 odbijenih mejlova, slanje ide dalje");
    expect(r.text).toContain("- GEO-SRB: 2");
    expect(r.text).toContain("Odbijeni (loša adresa): 1");
    expect(r.text).toContain("Lunds kommun <lund@lund.se>");
  });
  it("pauziran mailbox je u naslovu", () => {
    const r = buildDailyReport("2026-10-22", [{ type: "mailbox_paused", detail: "Bounce stopa", group: null, company: null, email: null, mailbox: "marcus@metricop-geo.com" }])!;
    expect(r.subject).toContain("mailbox pauziran");
  });
});
