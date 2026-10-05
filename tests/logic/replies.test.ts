import { describe, expect, it } from "vitest";
import { classifyMessage, classifyThread, evaluateNewMessages, parseAddress } from "@logic/replies.ts";

const ours = ["nikola@metricop.com", "outreach@metricop.com"];

describe("classifyMessage", () => {
  it("naša poruka", () => {
    expect(classifyMessage({ from: "Nikola <Nikola@metricop.com>" }, ours)).toBe("ours");
    expect(classifyMessage({ from: "outreach@metricop.com" }, ours)).toBe("ours");
  });
  it("bounce od mailer-daemon ili postmaster", () => {
    expect(classifyMessage({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }, ours)).toBe("bounce");
    expect(classifyMessage({ from: "postmaster@firma.rs" }, ours)).toBe("bounce");
  });
  it("automatski odgovor po zaglavlju Auto-Submitted", () => {
    expect(classifyMessage({ from: "a@firma.rs", autoSubmitted: "auto-replied" }, ours)).toBe("auto_reply");
    expect(classifyMessage({ from: "a@firma.rs", autoSubmitted: "no", subject: "Re: Ponuda" }, ours)).toBe("reply");
  });
  it("automatski odgovor po naslovu", () => {
    for (const subject of ["Out of Office: Re: Ponuda", "Automatski odgovor", "Automatic reply: X", "Autosvar: hej", "Frånvaro"]) {
      expect(classifyMessage({ from: "a@firma.rs", subject }, ours)).toBe("auto_reply");
    }
  });
  it("svaka druga poruka je odgovor", () => {
    expect(classifyMessage({ from: "Marko <marko@geoplan.rs>", subject: "Re: Saradnja" }, ours)).toBe("reply");
  });
});

describe("classifyThread", () => {
  it("samo naše poruke = ništa", () => {
    expect(classifyThread([{ from: ours[0] }, { from: ours[0] }], ours)).toBe("none");
  });
  it("odgovor zaustavlja sekvencu i pored auto-odgovora", () => {
    expect(
      classifyThread([{ from: ours[0] }, { from: "a@f.rs", subject: "Out of office" }, { from: "a@f.rs", subject: "Re: X" }], ours),
    ).toBe("reply");
  });
  it("bounce ima prednost", () => {
    expect(classifyThread([{ from: ours[0] }, { from: "mailer-daemon@google.com" }], ours)).toBe("bounce");
  });
  it("samo auto-odgovor", () => {
    expect(classifyThread([{ from: ours[0] }, { from: "a@f.rs", autoSubmitted: "auto-replied" }], ours)).toBe("auto_reply");
  });
});

describe("parseAddress", () => {
  it("izvlači adresu", () => {
    expect(parseAddress('"Geo, Plan" <Info@GeoPlan.rs>')).toBe("info@geoplan.rs");
  });
});

describe("evaluateNewMessages", () => {
  const sent = { id: "m1", from: "Nikola <nikola@metricop.com>" };
  it("samo naše poruke: ništa, ali pamti poslednju", () => {
    expect(evaluateNewMessages([sent], ours, null)).toMatchObject({ outcome: "none", lastSeenId: "m1" });
  });
  it("odgovor posle naše poruke", () => {
    const r = evaluateNewMessages([sent, { id: "m2", from: "marko@geo.rs", subject: "Re: X", snippet: "Hvala" }], ours, "m1");
    expect(r.outcome).toBe("reply");
    expect(r.message?.id).toBe("m2");
    expect(r.lastSeenId).toBe("m2");
  });
  it("već viđen auto-odgovor se ne broji ponovo", () => {
    const msgs = [sent, { id: "m2", from: "a@geo.rs", subject: "Out of office" }];
    expect(evaluateNewMessages(msgs, ours, "m1").autoReplies).toHaveLength(1);
    expect(evaluateNewMessages(msgs, ours, "m2")).toMatchObject({ outcome: "none", autoReplies: [] });
  });
  it("auto-odgovor pa pravi odgovor: odgovor odlučuje", () => {
    const r = evaluateNewMessages(
      [sent, { id: "m2", from: "a@geo.rs", autoSubmitted: "auto-replied" }, { id: "m3", from: "a@geo.rs", subject: "Re: X" }],
      ours,
      "m1",
    );
    expect(r.outcome).toBe("reply");
    expect(r.message?.id).toBe("m3");
    expect(r.autoReplies.map((m) => m.id)).toEqual(["m2"]);
  });
  it("bounce ima prednost", () => {
    const r = evaluateNewMessages([sent, { id: "m2", from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification" }], ours, null);
    expect(r).toMatchObject({ outcome: "bounce", message: { id: "m2" } });
  });
  it("ako poslednja viđena poruka više ne postoji, gleda celu nit", () => {
    expect(evaluateNewMessages([sent, { id: "m2", from: "x@y.rs" }], ours, "obrisana").outcome).toBe("reply");
  });
});
