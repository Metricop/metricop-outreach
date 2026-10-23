import { describe, expect, it } from "vitest";
import { tenderFit } from "../../supabase/functions/_shared/logic/tenderFit.ts";

describe("tenderFit", () => {
  it("pribor i skeneri imaju najveću šansu", () => {
    expect(tenderFit("Rahmenvereinbarung (RV) über die Lieferung von Vermessungsbedarf", "38290000")).toEqual({
      score: 85,
      note: "pribor",
    });
    expect(tenderFit("Leverans av laserskanner och stativ", "38296000").score).toBe(85);
  });
  it("instrumenti iz ponude", () => {
    const f = tenderFit("levering van waterpastoestellen, totaalstations, GNSS-toestellen", "38290000");
    expect(f).toEqual({ score: 70, note: "GNSS, totalne stanice, niveliri" });
  });
  it("servis i softver smanjuju šansu", () => {
    const f = tenderFit("Lieferung mobiler 3D-Laserscanner inklusive Software, Cloud-Diensten sowie Wartungsleistungen", "72313000");
    expect(f.score).toBe(70);
    expect(f.note).toContain("servis");
  });
  it("sistem za vozilo i usluge merenja su slabi", () => {
    expect(tenderFit("Mobile Mapping-System zur fahrzeuggestützten Erfassung", "38296000").score).toBe(35);
    expect(tenderFit("Netzdokumentation und Vermessungsleistungen", "71250000")).toEqual({
      score: 20,
      note: "geodetska oprema; objavljen kao usluga",
    });
    expect(tenderFit("DGM-W Niederrhein - TLS-Messung", "71355000").score).toBe(5);
  });
  it("mobile mapping bez reči za ručni sistem traži proveru", () => {
    expect(tenderFit("Aquisição de Sistema Móvel de Mapeamento (Mobile Mapping System)", "38295000")).toEqual({
      score: 60,
      note: "skeneri; proveriti da li je sistem za vozilo",
    });
    expect(tenderFit("Mobile mapping backpack laser scanner", "38295000").score).toBe(85);
  });
  it("oprema koju nemamo", () => {
    expect(tenderFit("Supply of a hydroacoustic telemetry system for fish studies", "38290000").score).toBe(5);
    expect(tenderFit("Hiperspektrinio skenavimo įranga, GNSS", "38500000").score).toBe(20);
  });
});
