import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../supabase/functions/_shared/logic/template.ts";

const body = "Poštovani, {{ime}},\n\n{{personalizacija}}\n\nPišem vam iz Metricopa za {{firma}} iz grada {{grad}}.";

describe("renderTemplate", () => {
  it("popunjava sva polja", () => {
    expect(
      renderTemplate(body, { ime: "Marko", firma: "Geo Plan", grad: "Novi Sad", personalizacija: "Videli smo vaš projekat." }),
    ).toBe("Poštovani, Marko,\n\nVideli smo vaš projekat.\n\nPišem vam iz Metricopa za Geo Plan iz grada Novi Sad.");
  });
  it("prazno ime uklanja i zarez ispred", () => {
    expect(renderTemplate("Zdravo, {{ime}}!", { ime: "" })).toBe("Zdravo!");
    expect(renderTemplate("Poštovani, {{ime}},", { ime: null })).toBe("Poštovani,");
  });
  it("prazna personalizacija uklanja ceo red", () => {
    expect(renderTemplate(body, { ime: "Ana", firma: "GB", grad: "Niš", personalizacija: "  " })).toBe(
      "Poštovani, Ana,\n\nPišem vam iz Metricopa za GB iz grada Niš.",
    );
    expect(renderTemplate("A\nUvod: {{personalizacija}}\nB", {})).toBe("A\nB");
  });
  it("prihvata razmake i velika slova u poljima", () => {
    expect(renderTemplate("{{ Firma }} / {{GRAD}}", { firma: "X", grad: "Y" })).toBe("X / Y");
  });
});
