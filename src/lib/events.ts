import { STATUS_LABELS, type ContactStatus } from "./types";

const EVENT_LABELS: Record<string, string> = {
  reply: "Odgovor",
  bounce: "Bounce",
  blocked: "Blokirao filter primaoca",
  auto_reply: "Automatski odgovor",
  error: "Greška",
  finished: "Završeno bez odgovora",
  skipped: "Preskočeno",
  mailbox_paused: "Mailbox pauziran",
  activated: "Uključeno iz reda čekanja",
  status_change: "Promena statusa",
  note: "Beleška",
  call: "Poziv",
  meeting: "Sastanak",
};

/** Ručne aktivnosti koje tim upisuje u istoriju kontakta. */
export const ACTIVITY_TYPES = ["note", "call", "meeting"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function eventLabel(type: string): string {
  const step = type.match(/^sent_step_(\d+)$/);
  if (step) return `Poslat korak ${step[1]}`;
  return EVENT_LABELS[type] ?? type;
}

/** Opis događaja za prikaz: promena statusa "paused → interested" postaje "Pauza → Zainteresovan". */
export function eventDetail(type: string, detail: string | null): string | null {
  if (type !== "status_change" || !detail) return detail;
  const m = detail.match(/^(\w+) → (\w+)$/);
  if (!m) return detail;
  const label = (s: string) => STATUS_LABELS[s as ContactStatus] ?? s;
  return `${label(m[1])} → ${label(m[2])}`;
}
