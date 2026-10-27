export const CONTACT_STATUSES = [
  "queued",
  "new",
  "in_sequence",
  "replied",
  "interested",
  "not_interested",
  "unsubscribed",
  "bounced",
  "finished_no_reply",
  "paused",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const STATUS_LABELS: Record<ContactStatus, string> = {
  queued: "U redu čekanja",
  new: "Novo",
  in_sequence: "U sekvenci",
  replied: "Odgovorio",
  interested: "Zainteresovan",
  not_interested: "Nije zainteresovan",
  unsubscribed: "Odjavljen",
  bounced: "Bounce",
  finished_no_reply: "Završeno bez odgovora",
  paused: "Pauza",
};

export interface Contact {
  id: string;
  group_id: string | null;
  company: string | null;
  first_name: string | null;
  email: string;
  city: string | null;
  personalization: string | null;
  source: string | null;
  status: ContactStatus;
  step: number;
  last_sent_at: string | null;
  next_send_at: string | null;
  gmail_thread_id: string | null;
  last_message_id: string | null;
  notes: string | null;
  created_at: string;
  company_id: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  country_code: string | null;
  linkedin_url: string | null;
  external_ref: string | null;
  tier: string | null;
  contact_role: ContactRole | null;
  planned_start: string | null;
  queue_position: number | null;
  interest_level: InterestLevel | null;
  next_step: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
  owner_email: string | null;
  tags: string[];
  updated_at: string;
}

export type InterestLevel = "high" | "medium" | "low";
export const INTEREST_LABELS: Record<InterestLevel, string> = { high: "Visoka", medium: "Srednja", low: "Niska" };

export type ContactRole = "primary" | "secondary";
export const ROLE_LABELS: Record<ContactRole, string> = { primary: "Primarni", secondary: "Drugi" };

/** Firma (outreach.companies). Jedna firma ima više kontakata. */
export interface Company {
  id: string;
  name: string;
  legal_form: string | null;
  reg_no: string | null;
  vat_id: string | null;
  website: string | null;
  domain: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  country_code: string | null;
  description: string | null;
  licenses: string | null;
  segment: string | null;
  source: string | null;
  tags: string[];
  owner_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const COUNTRY_OPTIONS = ["RS", "SE", "US", "BA", "ME", "HR", "MK", "NO", "DK", "FI", "DE"];

export interface Group {
  id: string;
  code: string;
  name: string;
  description: string | null;
  mailbox_id: string | null;
  sequence_id: string | null;
  active: boolean;
  priority: number;
  /** Prazno = potpis mailboxa. */
  signature: string | null;
  /** Prazno = radno vreme mailboxa. */
  timezone: string | null;
  send_hour_from: number | null;
  send_hour_to: number | null;
  /** Država kontakata u grupi; prazno = tržište mailboxa. */
  country_code: string | null;
  /** Jutarnje uključivanje iz reda čekanja: koliko dnevno; prazno = bez reda. */
  daily_new_quota: number | null;
}

export type Market = "RS" | "SE" | "US";

export const MARKET_LABELS: Record<Market, string> = { RS: "Srbija", SE: "Švedska", US: "SAD" };

export const TIMEZONE_OPTIONS = [
  "Europe/Belgrade",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

export interface Mailbox {
  id: string;
  email: string;
  alias_email: string | null;
  display_name: string | null;
  signature: string | null;
  market: Market;
  daily_limit_new: number;
  daily_limit_total: number;
  per_run_limit: number;
  send_hour_from: number;
  send_hour_to: number;
  timezone: string;
  active: boolean;
  test_mode: boolean;
  test_email: string | null;
  paused_reason: string | null;
  created_at: string;
}

export interface SequenceStep {
  sequence_id: string;
  step_no: number;
  wait_days: number;
  subject: string | null;
  body: string;
}

export interface MailboxOption {
  id: string;
  email: string;
  display_name: string | null;
  market: Market;
}

export interface SequenceOption {
  id: string;
  name: string;
  language: string;
}

export interface EventRow {
  id: number;
  contact_id: string | null;
  mailbox_id: string | null;
  type: string;
  detail: string | null;
  created_at: string;
  created_by: string | null;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("sr-Latn-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
