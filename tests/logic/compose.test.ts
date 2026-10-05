import { describe, expect, it } from "vitest";
import { composeEmail, textToHtml } from "@logic/compose.ts";

const base = {
  firstSubject: "Saradnja za {{firma}}",
  vars: { ime: "Marko", firma: "Geo Plan", grad: "Niš", personalizacija: "" },
  signature: "Nikola\nMetricop",
};

describe("composeEmail", () => {
  it("korak 1: popunjen naslov, tekst i potpis", () => {
    const e = composeEmail({ ...base, stepNo: 1, subject: "Saradnja za {{firma}}", body: "Zdravo, {{ime}},\n\n{{personalizacija}}\nPišem iz Metricopa." });
    expect(e.subject).toBe("Saradnja za Geo Plan");
    expect(e.text).toBe("Zdravo, Marko,\n\nPišem iz Metricopa.\n\nNikola\nMetricop");
    expect(e.html).toContain("<p>Nikola<br>Metricop</p>");
  });
  it("follow-up dobija Re: i naslov prvog koraka", () => {
    const e = composeEmail({ ...base, stepNo: 2, subject: "ignorisano", body: "Samo da proverim." });
    expect(e.subject).toBe("Re: Saradnja za Geo Plan");
  });
  it("test mod dodaje [TEST] na početak naslova", () => {
    expect(composeEmail({ ...base, stepNo: 1, subject: "Zdravo", body: "x", testMode: true }).subject).toBe("[TEST] Zdravo");
    expect(composeEmail({ ...base, stepNo: 3, subject: null, body: "x", testMode: true }).subject).toBe("[TEST] Re: Saradnja za Geo Plan");
  });
  it("bez potpisa nema praznih redova na kraju", () => {
    expect(composeEmail({ ...base, signature: "", stepNo: 2, subject: null, body: "Tekst\n\n" }).text).toBe("Tekst");
  });
});

describe("textToHtml", () => {
  it("escape i pasusi, bez slika", () => {
    expect(textToHtml("A <b> & B\nC\n\nD")).toBe(
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5"><p>A &lt;b&gt; &amp; B<br>C</p><p>D</p></div>',
    );
  });
});
