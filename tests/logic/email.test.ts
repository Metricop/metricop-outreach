import { describe, expect, it } from "vitest";
import { emailDomain, isSuppressed, isTeamEmail, isValidEmail } from "../../supabase/functions/_shared/logic/email.ts";

describe("isTeamEmail", () => {
  it("pušta samo @metricop.com", () => {
    expect(isTeamEmail("nikola@metricop.com")).toBe(true);
    expect(isTeamEmail("  Nikola@MetriCop.com ")).toBe(true);
    expect(isTeamEmail("nikola@gmail.com")).toBe(false);
    expect(isTeamEmail("x@evilmetricop.com")).toBe(false);
    expect(isTeamEmail("x@metricop.com.evil.rs")).toBe(false);
    expect(isTeamEmail("")).toBe(false);
    expect(isTeamEmail(null)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("prepoznaje ispravne i neispravne adrese", () => {
    expect(isValidEmail("info@geo-biro.rs")).toBe(true);
    expect(isValidEmail("info@geo")).toBe(false);
    expect(isValidEmail("info geo@biro.rs")).toBe(false);
    expect(isValidEmail("a@b@c.rs")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isSuppressed", () => {
  const list = { emails: new Set(["odjava@firma.rs"]), domains: new Set(["blokiran.se"]) };
  it("blokira adresu i ceo domen", () => {
    expect(isSuppressed("Odjava@Firma.rs", list)).toBe(true);
    expect(isSuppressed("bilo.ko@blokiran.se", list)).toBe(true);
    expect(isSuppressed("info@firma.rs", list)).toBe(false);
  });
  it("vraća domen adrese", () => {
    expect(emailDomain("Info@Geo.RS")).toBe("geo.rs");
  });
});
