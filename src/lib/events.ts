const EVENT_LABELS: Record<string, string> = {
  reply: "Odgovor",
  bounce: "Bounce",
  auto_reply: "Automatski odgovor",
  error: "Greška",
  finished: "Završeno bez odgovora",
};

export function eventLabel(type: string): string {
  const step = type.match(/^sent_step_(\d+)$/);
  if (step) return `Poslat korak ${step[1]}`;
  return EVENT_LABELS[type] ?? type;
}
