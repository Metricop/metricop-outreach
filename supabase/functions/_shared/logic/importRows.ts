// Provera redova pre uvoza kontakata: ispravan email, duplikati, lista za izuzimanje.

import { emailDomain, isValidEmail, normalizeEmail, type SuppressionList } from "./email.ts";

export const IMPORT_FIELDS = ["company", "first_name", "email", "city", "personalization", "source"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ImportRow = Partial<Record<ImportField, string>>;

export type SkipReason =
  | "invalid_email"
  | "duplicate_in_file"
  | "duplicate_in_db"
  | "suppressed_email"
  | "suppressed_domain";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  invalid_email: "Neispravan email",
  duplicate_in_file: "Duplikat u fajlu",
  duplicate_in_db: "Već postoji u bazi",
  suppressed_email: "Adresa je na listi za izuzimanje",
  suppressed_domain: "Domen je na listi za izuzimanje",
};

export interface ValidRow extends ImportRow {
  email: string;
  rowNumber: number;
}

export interface SkippedRow {
  rowNumber: number; // red u fajlu, zaglavlje je red 1
  email: string;
  reason: SkipReason;
}

export interface ImportCheck {
  valid: ValidRow[];
  skipped: SkippedRow[];
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t;
};

export function checkImportRows(
  rows: ImportRow[],
  existingEmails: Set<string>,
  suppression: SuppressionList,
): ImportCheck {
  const valid: ValidRow[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const raw = (row.email ?? "").trim();
    const email = normalizeEmail(raw.replace(/^mailto:/i, ""));
    const skip = (reason: SkipReason) => skipped.push({ rowNumber, email: raw, reason });

    if (!isValidEmail(email)) return skip("invalid_email");
    if (seen.has(email)) return skip("duplicate_in_file");
    seen.add(email);
    if (suppression.emails.has(email)) return skip("suppressed_email");
    if (suppression.domains.has(emailDomain(email))) return skip("suppressed_domain");
    if (existingEmails.has(email)) return skip("duplicate_in_db");

    valid.push({
      rowNumber,
      email,
      company: clean(row.company),
      first_name: clean(row.first_name),
      city: clean(row.city),
      personalization: clean(row.personalization),
      source: clean(row.source),
    });
  });

  return { valid, skipped };
}

const HEADER_GUESSES: Record<ImportField, RegExp> = {
  company: /^(firma|kompanija|company|naziv( firme)?|organizacija|företag|bolag)$/i,
  first_name: /^(ime|first ?name|kontakt ?osoba|name|förnamn|namn)$/i,
  email: /^(e-?mail|e-?pošta|mejl|mail|adresa|e-?post)$/i,
  city: /^(grad|mesto|city|ort|stad)$/i,
  personalization: /^(personalizacija|personalization|uvod)$/i,
  source: /^(izvor|source|källa)$/i,
};

/** Predlog mapiranja kolona po nazivima iz zaglavlja. */
export function guessMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  for (const field of IMPORT_FIELDS) {
    const idx = headers.findIndex((h) => HEADER_GUESSES[field].test(h.trim()));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}
