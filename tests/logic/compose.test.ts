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
    expect(e.html).toContain("<div>Nikola</div><div>Metricop</div>");
  });
  it("follow-up dobija Re: i naslov prvog koraka", () => {
    const e = composeEmail({ ...base, stepNo: 2, subject: "ignorisano", body: "Samo da proverim." });
    expect(e.subject).toBe("Re: Saradnja za Geo Plan");
  });
  it("test mod dodaje [TEST] na početak naslova", () => {
    expect(composeEmail({ ...base, stepNo: 1, subject: "Zdravo", body: "x", testMode: true }).subject).toBe("[TEST] Zdravo");
    expect(composeEmail({ ...base, stepNo: 3, subject: null, body: "x", testMode: true }).subject).toBe("[TEST] Re: Saradnja za Geo Plan");
  });
  it("potpis: podebljano, linkovi i logo u HTML-u; tekst bez oznaka i bez slike", () => {
    const signature = "Med vänlig hälsning,\n\n**Marcus** | Sales Manager\nmarcus@metricop-geo.com\nwww.metricop.se\n![Metricop](https://example.com/logo.png)";
    const e = composeEmail({ ...base, signature, stepNo: 2, subject: null, body: "Hej" });
    expect(e.text).toBe("Hej\n\nMed vänlig hälsning,\n\nMarcus | Sales Manager\nmarcus@metricop-geo.com\nwww.metricop.se");
    expect(e.html).toContain("<div><strong>Marcus</strong> | Sales Manager</div>");
    expect(e.html).toContain('<a href="mailto:marcus@metricop-geo.com">marcus@metricop-geo.com</a>');
    expect(e.html).toContain('<a href="https://www.metricop.se">www.metricop.se</a>');
    expect(e.html).toContain('<img src="https://example.com/logo.png" alt="Metricop" width="96"');
    expect(e.html.endsWith("</div></div>")).toBe(true);
  });
  it("adresa u potpisu ne postaje link: cifre su razdvojene nevidljivim znakom, tekst ostaje čist", () => {
    const e = composeEmail({ ...base, signature: "Glöstorps Röseväg 13\n417 45 Göteborg\nwww.metricop.se", stepNo: 2, subject: null, body: "Hej" });
    expect(e.html).toContain("<div>Glöstorps Röseväg 1&zwnj;3</div><div>4&zwnj;1&zwnj;7 4&zwnj;5 Göteborg</div>");
    expect(e.html).toContain('<a href="https://www.metricop.se">www.metricop.se</a>');
    expect(e.text).toBe("Hej\n\nGlöstorps Röseväg 13\n417 45 Göteborg\nwww.metricop.se");
  });
  it("bez potpisa nema praznih redova na kraju", () => {
    expect(composeEmail({ ...base, signature: "", stepNo: 2, subject: null, body: "Tekst\n\n" }).text).toBe("Tekst");
  });
});

describe("textToHtml", () => {
  it("escape i pasusi, bez slika", () => {
    expect(textToHtml("A <b> & B\nC\n\nD")).toBe(
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222"><p style="color:#222222">A &lt;b&gt; &amp; B<br>C</p><p style="color:#222222">D</p></div>',
    );
  });

  it("linkovi u potpisu i tekstu vode na https, adresa na mailto", () => {
    const html = textToHtml(
      "Specs: https://metricop.com/collections/handheld-lidar-scanners.\n\nnikola@metricop.com | metricop.com\nwww.metricop.rs",
    );
    expect(html).toContain('<a href="https://metricop.com/collections/handheld-lidar-scanners">https://metricop.com/collections/handheld-lidar-scanners</a>.');
    expect(html).toContain('<a href="mailto:nikola@metricop.com">nikola@metricop.com</a> | <a href="https://metricop.com">metricop.com</a>');
    expect(html).toContain('<a href="https://www.metricop.rs">www.metricop.rs</a>');
  });

  it("ne pravi link od reči sa tačkom koje nisu domen", () => {
    expect(textToHtml("Kralja Stefana 6. Niš, Srbija")).not.toContain("<a ");
  });

  it("link sa imenom: čitalac vidi ime, link vodi na punu adresu", () => {
    const html = textToHtml("See [the Trion lineup](https://metricop.com/lp/fjd/lidar?utm_source=email&utm_campaign=x) here.");
    expect(html).toContain('See <a href="https://metricop.com/lp/fjd/lidar?utm_source=email&amp;utm_campaign=x">the Trion lineup</a> here.');
    expect(html).not.toContain(">https://");
  });
});

describe("link sa imenom u tekstualnoj verziji", () => {
  it("postaje ime (adresa)", () => {
    const e = composeEmail({ ...base, signature: "", stepNo: 2, subject: null, body: "Look at [the page](https://metricop.com/lp) please." });
    expect(e.text).toBe("Look at the page (https://metricop.com/lp) please.");
    expect(e.html).toContain('<a href="https://metricop.com/lp">the page</a>');
  });
});
