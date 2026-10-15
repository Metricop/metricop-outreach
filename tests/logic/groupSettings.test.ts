import { describe, expect, it } from "vitest";
import { effectiveSendWindow, effectiveSignature } from "@logic/groupSettings.ts";
import { isWithinSendWindow } from "@logic/schedule.ts";

const mailbox = {
  signature: "Nikola Miladinovic\nMetricop d.o.o.",
  timezone: "Europe/Belgrade",
  send_hour_from: 9,
  send_hour_to: 17,
};

describe("effectiveSignature", () => {
  it("bez potpisa grupe važi potpis mailboxa", () => {
    expect(effectiveSignature(mailbox, null)).toBe(mailbox.signature);
    expect(effectiveSignature(mailbox, { signature: "   " })).toBe(mailbox.signature);
  });
  it("potpis grupe zamenjuje potpis mailboxa", () => {
    expect(effectiveSignature(mailbox, { signature: "Nikola\nMetricop LLC\n" })).toBe("Nikola\nMetricop LLC");
  });
});

describe("effectiveSendWindow", () => {
  it("bez podešavanja grupe važi radno vreme mailboxa", () => {
    expect(effectiveSendWindow(mailbox, {})).toEqual({ timezone: "Europe/Belgrade", sendHourFrom: 9, sendHourTo: 17 });
  });
  it("američka grupa šalje po američkom vremenu sa istog naloga", () => {
    const us = effectiveSendWindow(mailbox, { timezone: "America/Chicago", send_hour_from: 9, send_hour_to: 16 });
    const rs = effectiveSendWindow(mailbox, null);
    // Utorak 13.10.2026. 16:00 UTC = 18:00 u Beogradu, 11:00 u Čikagu.
    const t = new Date("2026-10-13T16:00:00Z");
    expect(isWithinSendWindow(t, us)).toBe(true);
    expect(isWithinSendWindow(t, rs)).toBe(false);
    // Utorak 08:00 UTC = 10:00 u Beogradu, 03:00 u Čikagu.
    const m = new Date("2026-10-13T08:00:00Z");
    expect(isWithinSendWindow(m, us)).toBe(false);
    expect(isWithinSendWindow(m, rs)).toBe(true);
  });
});
