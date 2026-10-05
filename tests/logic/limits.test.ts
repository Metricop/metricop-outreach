import { describe, expect, it } from "vitest";
import {
  effectiveDailyLimits,
  planRun,
  randomPauseMs,
  shouldPauseForBounces,
} from "../../supabase/functions/_shared/logic/limits.ts";

const now = new Date("2026-10-20T08:00:00Z");
const old = new Date("2026-09-01T00:00:00Z"); // posle zagrevanja
const fresh = new Date("2026-10-15T00:00:00Z"); // u prve dve nedelje

const mb = (o: Partial<Parameters<typeof effectiveDailyLimits>[0]> = {}) => ({
  dailyLimitNew: 10,
  dailyLimitTotal: 20,
  perRunLimit: 3,
  createdAt: old,
  ...o,
});

describe("effectiveDailyLimits", () => {
  it("poštuje podešavanje", () => {
    expect(effectiveDailyLimits(mb({ dailyLimitNew: 15, dailyLimitTotal: 40 }), now)).toEqual({
      maxNew: 15,
      maxTotal: 40,
    });
  });
  it("tvrda granica 50 bez obzira na podešavanje", () => {
    expect(effectiveDailyLimits(mb({ dailyLimitNew: 80, dailyLimitTotal: 200 }), now)).toEqual({
      maxNew: 50,
      maxTotal: 50,
    });
  });
  it("prve dve nedelje najviše 10 novih i 20 ukupno", () => {
    expect(
      effectiveDailyLimits(mb({ dailyLimitNew: 30, dailyLimitTotal: 40, createdAt: fresh }), now),
    ).toEqual({ maxNew: 10, maxTotal: 20 });
  });
  it("novih nikad više od ukupnog", () => {
    expect(effectiveDailyLimits(mb({ dailyLimitNew: 30, dailyLimitTotal: 20 }), now).maxNew).toBe(20);
  });
});

describe("planRun", () => {
  it("najviše per_run_limit po krugu, follow-upovi prvi", () => {
    expect(planRun(mb(), { sentNew: 0, sentTotal: 0 }, now, 5, 10)).toEqual({
      followups: 3,
      newContacts: 0,
    });
    expect(planRun(mb(), { sentNew: 0, sentTotal: 0 }, now, 1, 10)).toEqual({
      followups: 1,
      newContacts: 2,
    });
  });
  it("staje na dnevnom limitu ukupno", () => {
    expect(planRun(mb(), { sentNew: 5, sentTotal: 19 }, now, 0, 10)).toEqual({
      followups: 0,
      newContacts: 1,
    });
    expect(planRun(mb(), { sentNew: 5, sentTotal: 20 }, now, 4, 10)).toEqual({
      followups: 0,
      newContacts: 0,
    });
  });
  it("staje na dnevnom limitu novih, follow-upovi i dalje idu", () => {
    expect(planRun(mb(), { sentNew: 10, sentTotal: 12 }, now, 1, 10)).toEqual({
      followups: 1,
      newContacts: 0,
    });
  });
  it("ne šalje više nego što ima kontakata", () => {
    expect(planRun(mb(), { sentNew: 0, sentTotal: 0 }, now, 0, 1)).toEqual({
      followups: 0,
      newContacts: 1,
    });
  });
});

describe("randomPauseMs", () => {
  it("između 15 i 45 sekundi", () => {
    expect(randomPauseMs(() => 0)).toBe(15_000);
    expect(randomPauseMs(() => 0.999999)).toBeLessThanOrEqual(45_000);
    expect(randomPauseMs(() => 0.5)).toBe(30_000);
  });
});

describe("shouldPauseForBounces", () => {
  it("pauzira iznad 3%", () => {
    expect(shouldPauseForBounces(100, 3)).toBe(false);
    expect(shouldPauseForBounces(100, 4)).toBe(true);
    expect(shouldPauseForBounces(0, 0)).toBe(false);
  });
});
