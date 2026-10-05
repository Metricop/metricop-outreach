import Papa from "papaparse";

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** CSV iz Excela je često u Windows-1250 kodnoj strani; probamo UTF-8 pa 1250. */
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1250").decode(buf);
  }
}

export async function parseContactsFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  let table: string[][];

  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    table = data.map((row) => row.map(cellToString));
  } else if (name.endsWith(".csv")) {
    const text = decodeText(await file.arrayBuffer());
    const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    table = res.data.map((row) => row.map(cellToString));
  } else {
    throw new Error("Podržani su samo CSV i XLSX fajlovi.");
  }

  table = table.filter((row) => row.some((c) => c !== ""));
  if (table.length < 2) throw new Error("Fajl nema redova sa podacima (prvi red mora biti zaglavlje).");

  const width = Math.max(...table.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => table[0][i] || `Kolona ${i + 1}`);
  const rows = table.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}
