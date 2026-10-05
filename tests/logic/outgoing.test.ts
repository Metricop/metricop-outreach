import { describe, expect, it } from "vitest";
import { prepareOutgoing } from "@logic/outgoing.ts";

const mailbox = {
  email: "info@metricop.com",
  alias_email: "nikola@metricop.com",
  display_name: "Nikola",
  signature: "Nikola\nMetricop",
  test_mode: false,
  test_email: "info@metricop.com",
};
const contact = {
  email: "marko@geoplan.rs",
  first_name: "Marko",
  company: "Geo Plan",
  city: "Niš",
  personalization: null,
  gmail_thread_id: null as string | null,
  last_message_id: null as string | null,
};
const steps = [
  { step_no: 2, subject: null, body: "Samo da proverim, {{ime}}." },
  { step_no: 1, subject: "Pitanje za {{firma}}", body: "Dobar dan, {{ime}}." },
];

describe("prepareOutgoing", () => {
  it("korak 1: nova poruka sa aliasa na adresu kontakta", () => {
    const o = prepareOutgoing(mailbox, contact, steps, 1);
    expect(o).toMatchObject({
      to: "marko@geoplan.rs",
      fromEmail: "nikola@metricop.com",
      subject: "Pitanje za Geo Plan",
      threadId: null,
      inReplyTo: null,
    });
    expect(o.text).toBe("Dobar dan, Marko.\n\nNikola\nMetricop");
  });

  it("korak 2: ista nit, Re: naslov i In-Reply-To prethodne poruke", () => {
    const o = prepareOutgoing(mailbox, { ...contact, gmail_thread_id: "t1", last_message_id: "<m1@mail.gmail.com>" }, steps, 2);
    expect(o).toMatchObject({
      subject: "Re: Pitanje za Geo Plan",
      threadId: "t1",
      inReplyTo: "<m1@mail.gmail.com>",
      references: "<m1@mail.gmail.com>",
    });
  });

  it("test mod: sve ide na test adresu sa [TEST], sve ostalo isto", () => {
    const o = prepareOutgoing({ ...mailbox, test_mode: true }, { ...contact, gmail_thread_id: "t1", last_message_id: "<m1>" }, steps, 2);
    expect(o.to).toBe("info@metricop.com");
    expect(o.subject).toBe("[TEST] Re: Pitanje za Geo Plan");
    expect(o.threadId).toBe("t1");
  });

  it("bez glavne adrese ako alias nije podešen", () => {
    expect(prepareOutgoing({ ...mailbox, alias_email: null }, contact, steps, 1).fromEmail).toBe("info@metricop.com");
  });

  it("greška ako korak ne postoji ili test adresa fali", () => {
    expect(() => prepareOutgoing(mailbox, contact, steps, 3)).toThrow();
    expect(() => prepareOutgoing({ ...mailbox, test_mode: true, test_email: null }, contact, steps, 1)).toThrow();
  });
});
