// Izvoz tabele u CSV koji Excel otvara ispravno (UTF-8 sa BOM, tačka-zarez kao razdvajač).

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | string[] | null | undefined;
}

function cell(v: string | number | boolean | string[] | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "da" : "ne") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(";")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Preuzimanje fajla u pregledaču. */
export function downloadText(fileName: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
