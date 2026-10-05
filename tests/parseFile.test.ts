import { describe, expect, it } from "vitest";
import { parseContactsFile } from "@/lib/parseFile";

const csvFile = (bytes: Uint8Array<ArrayBuffer> | string, name = "kontakti.csv") => new File([bytes], name);

describe("parseContactsFile", () => {
  it("čita CSV sa tačka-zarezom i srpskim slovima (UTF-8)", async () => {
    const p = await parseContactsFile(csvFile("Firma;Grad;Email\nGeo Đurđević;Čačak;a@b.rs\n\n"));
    expect(p.headers).toEqual(["Firma", "Grad", "Email"]);
    expect(p.rows).toEqual([["Geo Đurđević", "Čačak", "a@b.rs"]]);
  });

  it("čita CSV sačuvan iz Excela u Windows-1250", async () => {
    // "Firma,Grad\nŠabac Geo,Niš" u kodnoj strani 1250
    const bytes = new Uint8Array([
      ...Buffer.from("Firma,Grad\n"),
      0x8a, ...Buffer.from("abac Geo,Ni"), 0x9a,
    ]);
    const p = await parseContactsFile(csvFile(bytes));
    expect(p.rows).toEqual([["Šabac Geo", "Niš"]]);
  });

  it("odbija fajl bez redova i nepodržan format", async () => {
    await expect(parseContactsFile(csvFile("Firma;Email\n"))).rejects.toThrow();
    await expect(parseContactsFile(csvFile("x", "kontakti.txt"))).rejects.toThrow("CSV i XLSX");
  });
});
