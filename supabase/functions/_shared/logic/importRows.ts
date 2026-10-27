// Provera redova pre uvoza kontakata: ispravan email, duplikati, lista za izuzimanje.

import { emailDomain, isValidEmail, normalizeEmail, type SuppressionList } from "./email.ts";

export const IMPORT_FIELDS = [
  "company",
  "first_name",
  "last_name",
  "title",
  "email",
  "phone",
  "city",
  "personalization",
  "source",
  "external_ref",
  "linkedin_url",
  "tags",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ImportRow = Partial<Record<ImportField, string>>;

export type SkipReason =
  | "invalid_email"
  | "duplicate_in_file"
  | "duplicate_in_db"
  | "suppressed_email"
  | "suppressed_domain"
  | "crm_blocked";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  invalid_email: "Neispravan email",
  duplicate_in_file: "Duplikat u fajlu",
  duplicate_in_db: "Već postoji u bazi",
  suppressed_email: "Adresa je na listi za izuzimanje",
  suppressed_domain: "Domen je na listi za izuzimanje",
  crm_blocked: "Postojeći kupac ili odjavljen u glavnoj aplikaciji",
};

export interface ValidRow extends Omit<ImportRow, "tags"> {
  email: string;
  rowNumber: number;
  tags: string[];
}

export interface SkippedRow {
  rowNumber: number; // red u fajlu, zaglavlje je red 1
  email: string;
  reason: SkipReason;
  /** Dodatno objašnjenje (npr. koji kupac). */
  detail?: string;
}

export interface ImportCheck {
  valid: ValidRow[];
  skipped: SkippedRow[];
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t;
};

/** Oznake iz jedne ćelije: "sajam, partner; 2026" → ["sajam", "partner", "2026"]. */
export function parseTags(value: string | undefined): string[] {
  const out: string[] = [];
  for (const t of (value ?? "").split(/[,;|]/)) {
    const tag = t.trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function checkImportRows(
  rows: ImportRow[],
  existingEmails: Set<string>,
  suppression: SuppressionList,
  crmBlocked: Map<string, string> = new Map(),
): ImportCheck {
  const valid: ValidRow[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const raw = (row.email ?? "").trim();
    const email = normalizeEmail(raw.replace(/^mailto:/i, ""));
    const skip = (reason: SkipReason, detail?: string) => skipped.push({ rowNumber, email: raw, reason, detail });

    if (!isValidEmail(email)) return skip("invalid_email");
    if (seen.has(email)) return skip("duplicate_in_file");
    seen.add(email);
    if (suppression.emails.has(email)) return skip("suppressed_email");
    if (suppression.domains.has(emailDomain(email))) return skip("suppressed_domain");
    if (crmBlocked.has(email)) return skip("crm_blocked", crmBlocked.get(email));
    if (existingEmails.has(email)) return skip("duplicate_in_db");

    valid.push({
      rowNumber,
      email,
      company: clean(row.company),
      first_name: clean(row.first_name),
      last_name: clean(row.last_name),
      title: clean(row.title),
      phone: clean(row.phone),
      city: clean(row.city),
      personalization: clean(row.personalization),
      source: clean(row.source),
      external_ref: clean(row.external_ref),
      linkedin_url: clean(row.linkedin_url),
      tags: parseTags(row.tags),
    });
  });

  return { valid, skipped };
}

const HEADER_GUESSES: Record<ImportField, RegExp> = {
  company: /^(firma|kompanija|company|naziv( firme)?|organizacija|företag|bolag)$/i,
  first_name: /^(ime|first ?name|kontakt ?osoba|name|förnamn|namn)$/i,
  last_name: /^(prezime|last ?name|surname|efternamn)$/i,
  title: /^(funkcija|pozicija|zvanje|title|job ?title|titel|befattning)$/i,
  email: /^(e-?mail|e-?pošta|mejl|mail|adresa|e-?post)$/i,
  phone: /^(telefon|tel\.?|mobilni|phone|mobile|telefonnummer)$/i,
  city: /^(grad|mesto|city|ort|stad)$/i,
  personalization: /^(personalizacija|personalization|uvod)$/i,
  source: /^(izvor|source|källa)$/i,
  external_ref: /^(šifra|sifra|id|ref|external ?id)$/i,
  linkedin_url: /^(linkedin|linkedin ?url|person linkedin url)$/i,
  tags: /^(oznake|tagovi|tags|labels)$/i,
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
