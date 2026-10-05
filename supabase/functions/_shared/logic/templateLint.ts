// Upozorenja u uređivaču šablona (pravila isporučivosti iz specifikacije).

export const KNOWN_FIELDS = ["ime", "firma", "grad", "personalizacija"];

const UNSUBSCRIBE_RE =
  /odjav|unsubscribe|ne želite|ne zelite|ne zanima|avregistr|avprenumer|avsluta|inte (vill|längre|är intresserad)|opt[- ]?out/i;
const LINK_RE = /(https?:\/\/|www\.)[^\s<>"]+/gi;

export interface LintInput {
  stepNo: number;
  subject: string | null;
  body: string;
  signature?: string | null;
}

export function countLinks(text: string): number {
  return (text.match(LINK_RE) ?? []).length;
}

export function lintStep(s: LintInput): string[] {
  const warnings: string[] = [];
  const body = s.body ?? "";

  if (s.stepNo === 1 && !(s.subject ?? "").trim()) warnings.push("Prvi korak mora da ima naslov.");
  if (!body.trim()) warnings.push("Tekst mejla je prazan.");
  if (s.stepNo === 1 && !UNSUBSCRIBE_RE.test(body)) {
    warnings.push("Prvi korak nema rečenicu za odjavu (npr. „Ako ne želite da vam pišemo, samo odgovorite i nećemo vam se više javljati.”).");
  }

  const links = countLinks(`${body}\n${s.signature ?? ""}`);
  if (links > 1) warnings.push(`Mejl ima ${links} linka (zajedno sa potpisom). Dozvoljen je najviše jedan.`);

  if (/<img|!\[|data:image/i.test(body)) warnings.push("Slike nisu dozvoljene u cold mejlovima.");

  const unknown = [...`${s.subject ?? ""}\n${body}`.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((m) => m[1].toLowerCase())
    .filter((f) => !KNOWN_FIELDS.includes(f));
  for (const f of new Set(unknown)) warnings.push(`Nepoznato polje {{${f}}}. Dozvoljena su: {{ime}}, {{firma}}, {{grad}}, {{personalizacija}}.`);

  return warnings;
}
