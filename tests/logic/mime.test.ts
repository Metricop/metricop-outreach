import { describe, expect, it } from "vitest";
import { base64Url, buildMime, encodeHeader } from "@logic/mime.ts";

const decodeWords = (h: string) =>
  h
    .split("\r\n ")
    .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString("utf8"))
    .join("");

describe("encodeHeader", () => {
  it("ASCII ostaje isti", () => {
    expect(encodeHeader("Saradnja")).toBe("Saradnja");
  });
  it("srpska slova se kodiraju i dekodiraju ispravno, i u dugom naslovu", () => {
    const s = "Saradnja za geodetski biro Đurđević iz Čačka — čćžšđ ČĆŽŠĐ, ponovo čćžšđ";
    const enc = encodeHeader(s);
    expect(enc.startsWith("=?UTF-8?B?")).toBe(true);
    expect(decodeWords(enc)).toBe(s);
    for (const w of enc.split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
  });
});

describe("buildMime", () => {
  const raw = buildMime({
    fromEmail: "nikola@metricop.com",
    fromName: "Nikola – Metricop",
    to: "marko@geo.rs",
    subject: "Re: Ponuda",
    text: "Zdravo, Marko!",
    html: "<p>Zdravo, Marko!</p>",
    inReplyTo: "<abc@mail.gmail.com>",
    references: "<abc@mail.gmail.com>",
    boundary: "B",
  });
  it("ima zaglavlja za nit i multipart/alternative", () => {
    expect(raw).toContain("To: marko@geo.rs\r\n");
    expect(raw).toContain("Subject: Re: Ponuda\r\n");
    expect(raw).toContain("In-Reply-To: <abc@mail.gmail.com>\r\n");
    expect(raw).toContain("References: <abc@mail.gmail.com>\r\n");
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="B"');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw.trimEnd().endsWith("--B--")).toBe(true);
    expect(raw).toMatch(/^From: =\?UTF-8\?B\?.+\?= <nikola@metricop\.com>/);
  });
  it("tekst je u base64 UTF-8", () => {
    expect(raw).toContain(Buffer.from("Zdravo, Marko!").toString("base64"));
  });
  it("base64url bez +, / i =", () => {
    expect(base64Url("ćšž??>>")).not.toMatch(/[+/=]/);
  });
});
