export const CONTACT_STATUSES = [
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
}

export interface Group {
  id: string;
  code: string;
  name: string;
  description: string | null;
  mailbox_id: string | null;
  sequence_id: string | null;
  active: boolean;
  priority: number;
}

export interface MailboxOption {
  id: string;
  email: string;
  display_name: string | null;
  market: "RS" | "SE";
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
