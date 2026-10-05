// Pomoćne funkcije za email adrese: provera ispravnosti, domen, lista za izuzimanje.

export const TEAM_DOMAIN = "metricop.com";

const EMAIL_RE = /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[a-z]{2,}$/i;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function emailDomain(email: string): string {
  const e = normalizeEmail(email);
  return e.slice(e.lastIndexOf("@") + 1);
}

/** Da li nalog sme da se prijavi u aplikaciju (samo @metricop.com). */
export function isTeamEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  return isValidEmail(e) && emailDomain(e) === TEAM_DOMAIN;
}

export interface SuppressionList {
  emails: Set<string>;
  domains: Set<string>;
}

/** Lista za izuzimanje ima prednost nad svim ostalim. */
export function isSuppressed(email: string, list: SuppressionList): boolean {
  const e = normalizeEmail(email);
  return list.emails.has(e) || list.domains.has(emailDomain(e));
}
