// Dnevni interni izveštaj posle slanja: šalje se samo ako je tog dana bilo odbijenih ili blokiranih mejlova,
// ili je neki mailbox pauziran, da se zna pre sledeće ture.

export interface ReportEvent {
  type: string;
  detail: string | null;
  group: string | null;
  company: string | null;
  email: string | null;
  mailbox: string | null;
}

export interface DailyReport {
  subject: string;
  text: string;
}

const isSent = (t: string) => t.startsWith("sent_step_");

/** Izveštaj za dan, ili null ako nema ničega što treba javiti. */
export function buildDailyReport(date: string, events: ReportEvent[]): DailyReport | null {
  const bounces = events.filter((e) => e.type === "bounce");
  const blocked = events.filter((e) => e.type === "blocked");
  const paused = events.filter((e) => e.type === "mailbox_paused");
  if (!bounces.length && !blocked.length && !paused.length) return null;

  const sentByGroup = new Map<string, number>();
  for (const e of events.filter((e) => isSent(e.type))) {
    const g = e.group ?? "bez grupe";
    sentByGroup.set(g, (sentByGroup.get(g) ?? 0) + 1);
  }
  const replies = events.filter((e) => e.type === "reply").length;

  const line = (e: ReportEvent) => `- ${e.company ?? "?"} <${e.email ?? "?"}> (${e.group ?? "?"}): ${(e.detail ?? "").slice(0, 160)}`;
  const parts = [
    `Izveštaj slanja za ${date}.`,
    "",
    "Poslato danas:",
    ...(sentByGroup.size ? [...sentByGroup].map(([g, n]) => `- ${g}: ${n}`) : ["- ništa"]),
    `Odgovora danas: ${replies}`,
  ];
  if (bounces.length) parts.push("", `Odbijeni (loša adresa): ${bounces.length}`, ...bounces.map(line));
  if (blocked.length) parts.push("", `Blokirao filter primaoca (adresa je ispravna): ${blocked.length}`, ...blocked.map(line));
  if (paused.length) parts.push("", "PAUZIRAN MAILBOX:", ...paused.map((e) => `- ${e.mailbox ?? "?"}: ${e.detail ?? ""}`));
  parts.push(
    "",
    "Kontakti sa odbijenim mejlom se više ne kontaktiraju. Slanje se pauzira tek posle 5 odbijenih (loših adresa) u 7 dana.",
  );

  const n = bounces.length + blocked.length;
  const subject = paused.length
    ? `[Outreach] ${date}: mailbox pauziran`
    : `[Outreach] ${date}: ${n} ${n === 1 ? "odbijen mejl" : "odbijenih mejlova"}, slanje ide dalje`;
  return { subject, text: parts.join("\n") };
}
