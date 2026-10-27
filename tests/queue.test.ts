import { describe, expect, it } from "vitest";
import { addBusinessDays, queueFinishDate } from "../src/lib/queue";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("red čekanja", () => {
  it("preskače vikend", () => {
    // Petak 30.10.2026 + 1 radni dan = ponedeljak 2.11.
    expect(ymd(addBusinessDays(new Date(2026, 9, 30), 1))).toBe("2026-11-02");
  });

  it("469 kontakata po 10 dnevno traje 47 radnih dana", () => {
    expect(ymd(queueFinishDate(469, 10, new Date(2026, 9, 27))!)).toBe(ymd(addBusinessDays(new Date(2026, 9, 27), 47)));
  });

  it("bez kvote nema procene", () => {
    expect(queueFinishDate(50, null, new Date())).toBeNull();
    expect(queueFinishDate(0, 10, new Date())).toBeNull();
  });
});
