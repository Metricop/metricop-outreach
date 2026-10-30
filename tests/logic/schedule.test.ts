import { describe, expect, it } from "vitest";
import { isPaused, isWithinSendWindow, localDate } from "../../supabase/functions/_shared/logic/schedule.ts";

const bg = { timezone: "Europe/Belgrade", sendHourFrom: 9, sendHourTo: 17 };
const se = { timezone: "Europe/Stockholm", sendHourFrom: 8, sendHourTo: 16 };

describe("isWithinSendWindow", () => {
  it("radni dan unutar radnog vremena", () => {
    // utorak 6.10.2026, 10:00 u Beogradu (UTC+2)
    expect(isWithinSendWindow(new Date("2026-10-06T08:00:00Z"), bg)).toBe(true);
  });
  it("pre početka i na kraju radnog vremena", () => {
    expect(isWithinSendWindow(new Date("2026-10-06T06:59:00Z"), bg)).toBe(false); // 08:59
    expect(isWithinSendWindow(new Date("2026-10-06T07:00:00Z"), bg)).toBe(true); // 09:00
    expect(isWithinSendWindow(new Date("2026-10-06T14:59:00Z"), bg)).toBe(true); // 16:59
    expect(isWithinSendWindow(new Date("2026-10-06T15:00:00Z"), bg)).toBe(false); // 17:00
  });
  it("vikend ne šalje", () => {
    expect(isWithinSendWindow(new Date("2026-10-10T08:00:00Z"), bg)).toBe(false); // subota
    expect(isWithinSendWindow(new Date("2026-10-11T08:00:00Z"), bg)).toBe(false); // nedelja
  });
  it("koristi zonu mailboxa i zimsko vreme", () => {
    // ponedeljak 2.11.2026, 07:30 UTC = 08:30 u Stokholmu (UTC+1)
    expect(isWithinSendWindow(new Date("2026-11-02T07:30:00Z"), se)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-11-02T06:30:00Z"), se)).toBe(false);
  });
  it("petak uveče po lokalnom vremenu je već van radnog vremena", () => {
    expect(isWithinSendWindow(new Date("2026-10-09T15:30:00Z"), bg)).toBe(false);
  });
});

describe("localDate", () => {
  it("datum po zoni mailboxa, ne po UTC", () => {
    expect(localDate(new Date("2026-10-05T22:30:00Z"), "Europe/Belgrade")).toBe("2026-10-06");
    expect(localDate(new Date("2026-10-05T21:30:00Z"), "Europe/Belgrade")).toBe("2026-10-05");
  });
});

describe("pauza grupe (praznici)", () => {
  const us = { timezone: "America/Chicago", sendHourFrom: 8, sendHourTo: 11, pauseFrom: "2026-12-24", pauseTo: "2027-01-01" };
  it("ne šalje tokom pauze, uključujući prvi i poslednji dan", () => {
    expect(isWithinSendWindow(new Date("2026-12-24T15:00:00Z"), us)).toBe(false); // čet 24.12. 09:00 Chicago
    expect(isWithinSendWindow(new Date("2026-12-30T15:00:00Z"), us)).toBe(false);
    expect(isWithinSendWindow(new Date("2027-01-01T15:00:00Z"), us)).toBe(false);
  });
  it("šalje pre i posle pauze", () => {
    expect(isWithinSendWindow(new Date("2026-12-23T15:00:00Z"), us)).toBe(true); // sre 23.12.
    expect(isWithinSendWindow(new Date("2027-01-04T15:00:00Z"), us)).toBe(true); // pon 4.1.
  });
  it("bez zadate pauze nema pauze", () => {
    expect(isPaused("2026-12-25", {})).toBe(false);
    expect(isPaused("2026-12-25", { pauseFrom: "2026-12-24", pauseTo: null })).toBe(false);
  });
});
