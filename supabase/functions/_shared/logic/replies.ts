// Prepoznavanje odgovora, bounce-a i automatskih odgovora iz zaglavlja Gmail niti.

export type MessageKind = "ours" | "bounce" | "auto_reply" | "reply";

export interface MessageHeaders {
  from: string;
  subject?: string | null;
  autoSubmitted?: string | null;
}

const AUTO_SUBJECT_PATTERNS = [
  /out of (the )?office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /autoreply/i,
  /automatski odgovor/i,
  /automatiskt svar/i,
  /autosvar/i,
  /frånvaro/i,
  /odsutan|odsutna/i,
];

/** Izvlači adresu iz zaglavlja From ("Ime <a@b.rs>" → "a@b.rs"). */
export function parseAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export function classifyMessage(h: MessageHeaders, ourAddresses: string[]): MessageKind {
  const addr = parseAddress(h.from);
  if (ourAddresses.some((a) => a.trim().toLowerCase() === addr)) return "ours";

  const local = addr.split("@")[0];
  if (local.startsWith("mailer-daemon") || local === "postmaster") return "bounce";

  const auto = (h.autoSubmitted ?? "").trim().toLowerCase();
  if (auto && auto !== "no") return "auto_reply";
  if (h.subject && AUTO_SUBJECT_PATTERNS.some((re) => re.test(h.subject!))) return "auto_reply";

  return "reply";
}

/**
 * Ishod cele niti: bounce i pravi odgovor zaustavljaju sekvencu,
 * automatski odgovor se samo beleži.
 */
export function classifyThread(
  messages: MessageHeaders[],
  ourAddresses: string[],
): "bounce" | "reply" | "auto_reply" | "none" {
  const kinds = messages.map((m) => classifyMessage(m, ourAddresses));
  if (kinds.includes("bounce")) return "bounce";
  if (kinds.includes("reply")) return "reply";
  if (kinds.includes("auto_reply")) return "auto_reply";
  return "none";
}

export interface ThreadMessage extends MessageHeaders {
  id: string;
  snippet?: string | null;
}

export interface ThreadEvaluation {
  outcome: "bounce" | "reply" | "auto_reply" | "none";
  /** Poruka koja je odlučila (bounce ili poslednji pravi odgovor). */
  message: ThreadMessage | null;
  autoReplies: ThreadMessage[];
  /** Poslednja pregledana poruka u niti; sledeći krug gleda samo novije. */
  lastSeenId: string | null;
}

/** Ocena poruka u niti koje su stigle posle poslednje pregledane. */
export function evaluateNewMessages(
  messages: ThreadMessage[],
  ourAddresses: string[],
  lastSeenId: string | null,
): ThreadEvaluation {
  const idx = lastSeenId ? messages.findIndex((m) => m.id === lastSeenId) : -1;
  const fresh = messages.slice(idx + 1).map((m) => ({ m, kind: classifyMessage(m, ourAddresses) }));
  const bounce = fresh.find((x) => x.kind === "bounce");
  const replies = fresh.filter((x) => x.kind === "reply");
  const autoReplies = fresh.filter((x) => x.kind === "auto_reply").map((x) => x.m);
  const outcome = bounce ? "bounce" : replies.length ? "reply" : autoReplies.length ? "auto_reply" : "none";
  return {
    outcome,
    message: bounce?.m ?? replies.at(-1)?.m ?? null,
    autoReplies,
    lastSeenId: messages.at(-1)?.id ?? lastSeenId,
  };
}
