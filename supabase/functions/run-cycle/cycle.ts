// Automatski krug za jedan mailbox (poziva ga pg_cron svakih 15 minuta).
// Redosled: bounce stopa -> provera odgovora -> radno vreme -> follow-upovi -> novi kontakti.

import {
  addThreadLabel,
  ensureLabel,
  getMessageIdHeader,
  getThreadMetadata,
  GmailAuthError,
  header,
  listThreadsWithIncoming,
  refreshAccessToken,
  sendRaw,
} from "../_shared/gmail.ts";
import type { Admin } from "../_shared/http.ts";
import { emailDomain } from "../_shared/logic/email.ts";
import { effectiveSendWindow, effectiveSignature } from "../_shared/logic/groupSettings.ts";
import { planRun, randomPauseMs, shouldPauseForBounces } from "../_shared/logic/limits.ts";
import { base64Url, buildMime } from "../_shared/logic/mime.ts";
import { prepareOutgoing, type OutgoingContact } from "../_shared/logic/outgoing.ts";
import { evaluateNewMessages, isPolicyBlock } from "../_shared/logic/replies.ts";
import { isWithinSendWindow, localDate } from "../_shared/logic/schedule.ts";
import { dueAction, stateAfterSend, type Step } from "../_shared/logic/sequence.ts";

const DAY_MS = 86_400_000;
const TIME_BUDGET_MS = 100_000; // Edge funkcija ima ograničeno vreme; ostatak ide u sledeći krug.
const REPLY_LABEL = "Outreach/Odgovori";
const LATE_REPLY_DAYS = 60;

interface StepRow {
  sequence_id: string;
  step_no: number;
  wait_days: number;
  subject: string | null;
  body: string;
}

type Contact = OutgoingContact & {
  id: string;
  group_id: string;
  status: string;
  step: number;
  next_send_at: string | null;
  notes: string | null;
  last_seen_message_id: string | null;
};

interface QueueItem {
  contact: Contact;
  stepNo: number;
  steps: StepRow[];
  isNew: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toSteps = (rows: StepRow[]): Step[] => rows.map((s) => ({ stepNo: s.step_no, waitDays: s.wait_days }));

export async function runMailboxCycle(admin: Admin, mailboxId: string) {
  const started = Date.now();
  const now = new Date();

  const { data: mailbox } = await admin.from("mailboxes").select("*").eq("id", mailboxId).single();
  if (!mailbox?.active) return { skipped: "Mailbox nije aktivan." };

  const log = (contactId: string | null, type: string, detail: string) =>
    admin.from("events").insert({ contact_id: contactId, mailbox_id: mailboxId, type, detail });

  const pauseMailbox = async (reason: string) => {
    await admin.from("mailboxes").update({ active: false, paused_reason: reason }).eq("id", mailboxId);
    await log(null, "mailbox_paused", reason);
    return { paused: reason };
  };

  // 1. Bounce stopa u poslednjih 7 dana.
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const [sent7, bounced7] = await Promise.all([
    admin.from("events").select("id", { count: "exact", head: true }).eq("mailbox_id", mailboxId).like("type", "sent_step_%").gte("created_at", since),
    admin.from("events").select("id", { count: "exact", head: true }).eq("mailbox_id", mailboxId).eq("type", "bounce").gte("created_at", since),
  ]);
  if (shouldPauseForBounces(sent7.count ?? 0, bounced7.count ?? 0)) {
    const rate = (((bounced7.count ?? 0) / (sent7.count || 1)) * 100).toFixed(1);
    return await pauseMailbox(`Bounce stopa ${rate}% u poslednjih 7 dana (dozvoljeno najviše 3%).`);
  }

  // 2. Gmail pristup; istekao ili opozvan token pauzira mailbox.
  const { data: refreshToken } = await admin.rpc("get_mailbox_token", { p_mailbox_id: mailboxId });
  if (!refreshToken) return await pauseMailbox("Gmail nalog nije povezan. Povežite ga u Podešavanjima.");
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(refreshToken);
  } catch (e) {
    if (e instanceof GmailAuthError) return await pauseMailbox("Gmail veza je istekla ili je opozvana. Povežite nalog ponovo u Podešavanjima.");
    throw e;
  }

  // 3. Provera odgovora (radi i van radnog vremena).
  let replyCheck: Awaited<ReturnType<typeof checkReplies>>;
  try {
    replyCheck = await checkReplies(admin, mailbox, accessToken, log);
  } catch (e) {
    if (e instanceof GmailAuthError) return await pauseMailbox("Gmail veza je istekla ili je opozvana. Povežite nalog ponovo u Podešavanjima.");
    throw e;
  }

  const { data: allGroups } = await admin
    .from("groups")
    .select("id, active, priority, sequence_id, signature, timezone, send_hour_from, send_hour_to")
    .eq("mailbox_id", mailboxId);
  if (!allGroups?.length) return { replies: replyCheck, skipped: "Mailbox nema dodeljenih grupa." };

  // 4. Radno vreme: pon–pet, u zoni grupe (ili mailboxa ako grupa nema svoje). Van toga samo provera odgovora.
  const groups = allGroups.filter((g) => isWithinSendWindow(now, effectiveSendWindow(mailbox, g)));
  if (!groups.length) return { replies: replyCheck, skipped: "Van radnog vremena." };

  const date = localDate(now, mailbox.timezone);
  const { data: counter } = await admin.from("daily_counters").select("sent_new, sent_total").eq("mailbox_id", mailboxId).eq("date", date).maybeSingle();
  const counts = { sentNew: counter?.sent_new ?? 0, sentTotal: counter?.sent_total ?? 0 };

  const seqIds = [...new Set(groups.map((g) => g.sequence_id).filter(Boolean))];
  const { data: stepRows } = seqIds.length
    ? await admin.from("sequence_steps").select("sequence_id, step_no, wait_days, subject, body").in("sequence_id", seqIds)
    : { data: [] as StepRow[] };
  const stepsOfGroup = (groupId: string): StepRow[] => {
    const seq = groups.find((g) => g.id === groupId)?.sequence_id;
    return ((stepRows ?? []) as StepRow[]).filter((s) => s.sequence_id === seq);
  };

  // 5. Follow-upovi kojima je vreme prošlo (i završetak sekvence posle poslednjeg čekanja).
  const { data: due } = await admin
    .from("contacts")
    .select("*")
    .eq("status", "in_sequence")
    .in("group_id", groups.map((g) => g.id))
    .lte("next_send_at", now.toISOString())
    .order("next_send_at")
    .limit(50);

  const followups: QueueItem[] = [];
  let finished = 0;
  for (const c of (due ?? []) as Contact[]) {
    const steps = stepsOfGroup(c.group_id);
    const action = dueAction({ status: c.status, step: c.step, nextSendAt: c.next_send_at ? new Date(c.next_send_at) : null }, toSteps(steps), now);
    if (action.type === "finish") {
      await admin.from("contacts").update({ status: "finished_no_reply", next_send_at: null }).eq("id", c.id);
      await log(c.id, "finished", "Sekvenca završena bez odgovora.");
      finished++;
    } else if (action.type === "send") {
      followups.push({ contact: c, stepNo: action.stepNo, steps, isNew: false });
    }
  }

  // Postojeći kupci i odjavljeni u glavnoj aplikaciji ne dobijaju ni follow-up.
  const blockedFollowups = await crmBlocked(admin, followups.map((f) => f.contact.email)).catch((e) => {
    console.warn("Provera kupaca za follow-upove nije uspela:", e instanceof Error ? e.message : e);
    return new Map<string, string>();
  });
  for (const f of followups.filter((f) => blockedFollowups.has(f.contact.email))) {
    await stopForCrm(admin, f.contact, blockedFollowups.get(f.contact.email)!, log);
  }
  const allowedFollowups = followups.filter((f) => !blockedFollowups.has(f.contact.email));

  // 6. Limiti za ovaj krug.
  const limits = {
    dailyLimitNew: mailbox.daily_limit_new,
    dailyLimitTotal: mailbox.daily_limit_total,
    perRunLimit: mailbox.per_run_limit,
    createdAt: new Date(mailbox.created_at),
  };
  const plan = planRun(limits, counts, now, allowedFollowups.length, 1000);

  // 7. Novi kontakti iz aktivnih grupa, po prioritetu grupe pa po datumu dodavanja.
  const queue: QueueItem[] = allowedFollowups.slice(0, plan.followups);
  const activeGroups = groups
    .filter((g) => g.active && stepsOfGroup(g.id).length > 0)
    .sort((a, b) => a.priority - b.priority);
  let newLeft = plan.newContacts;
  for (const g of activeGroups) {
    if (newLeft <= 0) break;
    const { data: candidates } = await admin
      .from("contacts")
      .select("*")
      .eq("status", "new")
      .eq("group_id", g.id)
      .order("created_at")
      .order("email")
      .limit(newLeft + 10);
    if (!candidates?.length) continue;

    // Lista za izuzimanje ima prednost nad svim ostalim.
    const emails = candidates.map((c) => c.email);
    const domains = [...new Set(emails.map(emailDomain))];
    const [{ data: supE }, { data: supD }] = await Promise.all([
      admin.from("suppression").select("email").in("email", emails),
      admin.from("suppression").select("domain").in("domain", domains),
    ]);
    const blockedE = new Set((supE ?? []).map((s) => s.email));
    const blockedD = new Set((supD ?? []).map((s) => s.domain));
    // Bez uspešne provere kupaca novi kontakti čekaju sledeći krug.
    let blockedCrm: Map<string, string>;
    try {
      blockedCrm = await crmBlocked(admin, emails);
    } catch (e) {
      console.warn("Provera kupaca nije uspela, novi kontakti čekaju:", e instanceof Error ? e.message : e);
      break;
    }

    for (const c of candidates as Contact[]) {
      if (newLeft <= 0) break;
      if (blockedE.has(c.email) || blockedD.has(emailDomain(c.email))) {
        await admin.from("contacts").update({ status: "paused", notes: note(c.notes, "Preskočeno: adresa ili domen je na listi za izuzimanje.") }).eq("id", c.id);
        await log(c.id, "skipped", "Adresa ili domen je na listi za izuzimanje.");
        continue;
      }
      if (blockedCrm.has(c.email)) {
        await stopForCrm(admin, c, blockedCrm.get(c.email)!, log);
        continue;
      }
      const steps = stepsOfGroup(g.id);
      queue.push({ contact: c, stepNo: Math.min(...steps.map((s) => s.step_no)), steps, isNew: true });
      newLeft--;
    }
  }

  if (queue.length === 0) return { replies: replyCheck, sent: 0, finished, message: "Nema mejlova za slanje u ovom krugu." };

  // 8. Slanje, sa nasumičnom pauzom 15–45 s između dva mejla.
  let sent = 0;
  for (const [i, item] of queue.entries()) {
    if (i > 0) {
      const pause = randomPauseMs();
      if (Date.now() - started + pause > TIME_BUDGET_MS) break;
      await sleep(pause);
    }
    const c = item.contact;
    try {
      const group = groups.find((g) => g.id === c.group_id);
      const out = prepareOutgoing({ ...mailbox, signature: effectiveSignature(mailbox, group) }, c, item.steps, item.stepNo);
      const raw = buildMime({
        fromEmail: out.fromEmail,
        fromName: out.fromName,
        to: out.to,
        subject: out.subject,
        text: out.text,
        html: out.html,
        inReplyTo: out.inReplyTo,
        references: out.references,
      });
      const res = await sendRaw(accessToken, base64Url(raw), out.threadId);
      const messageId = await getMessageIdHeader(accessToken, res.id).catch(() => null);
      const sentAt = new Date();
      const next = stateAfterSend(item.stepNo, toSteps(item.steps), sentAt);
      await admin
        .from("contacts")
        .update({
          status: "in_sequence",
          step: item.stepNo,
          last_sent_at: sentAt.toISOString(),
          next_send_at: next.nextSendAt?.toISOString() ?? null,
          gmail_thread_id: res.threadId,
          last_message_id: messageId ?? c.last_message_id,
        })
        .eq("id", c.id);
      await admin.rpc("bump_daily_counter", { p_mailbox_id: mailboxId, p_date: date, p_is_new: item.isNew });
      await log(c.id, `sent_step_${item.stepNo}`, mailbox.test_mode ? `TEST → ${out.to}: ${out.subject}` : out.subject);
      sent++;
    } catch (e) {
      if (e instanceof GmailAuthError) {
        await pauseMailbox("Gmail veza je istekla ili je opozvana. Povežite nalog ponovo u Podešavanjima.");
        break;
      }
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("contacts").update({ status: "paused", notes: note(c.notes, `Greška pri slanju (${date}): ${message}`) }).eq("id", c.id);
      await log(c.id, "error", message);
    }
  }

  return { replies: replyCheck, sent, finished, queued: queue.length };
}

// deno-lint-ignore no-explicit-any
type Mailbox = Record<string, any>;
type Log = (contactId: string | null, type: string, detail: string) => PromiseLike<unknown>;

/**
 * Provera odgovora: niti kontakata "U sekvenci" (i nedavno završenih ili pauziranih) u kojima je stigla nova poruka.
 * Bounce -> Bounce (adresa ide na listu za izuzimanje), pravi odgovor -> Odgovorio
 * (sekvenca staje, nit dobija labelu), automatski odgovor -> samo događaj.
 */
async function checkReplies(admin: Admin, mailbox: Mailbox, accessToken: string, log: Log) {
  const { data: groups } = await admin.from("groups").select("id").eq("mailbox_id", mailbox.id);
  if (!groups?.length) return { checked: 0, replies: 0, bounces: 0, autoReplies: 0 };

  // I kasni odgovori: posle kraja sekvence ili pauze, do 60 dana od poslednjeg mejla.
  const lateSince = new Date(Date.now() - LATE_REPLY_DAYS * DAY_MS).toISOString();
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, email, gmail_thread_id, last_seen_message_id, notes")
    .in("status", ["in_sequence", "finished_no_reply", "paused"])
    .or(`status.eq.in_sequence,last_sent_at.gte.${lateSince}`)
    .in("group_id", groups.map((g) => g.id))
    .not("gmail_thread_id", "is", null)
    .limit(5000);
  if (!contacts?.length) return { checked: 0, replies: 0, bounces: 0, autoReplies: 0 };

  // Jedan upit nalazi niti sa novom dolaznom poštom; čitamo samo njih.
  const incoming = await listThreadsWithIncoming(accessToken);
  const toCheck = contacts.filter((c) => incoming.has(c.gmail_thread_id!));
  const ours = [mailbox.email, mailbox.alias_email].filter(Boolean) as string[];

  let labelId: string | null | undefined;
  const stats = { checked: toCheck.length, replies: 0, bounces: 0, autoReplies: 0 };

  for (const c of toCheck) {
    const messages = (await getThreadMetadata(accessToken, c.gmail_thread_id!)).map((m) => ({
      id: m.id,
      from: header(m, "From") ?? "",
      subject: header(m, "Subject"),
      autoSubmitted: header(m, "Auto-Submitted"),
      snippet: m.snippet ?? null,
    }));
    const r = evaluateNewMessages(messages, ours, c.last_seen_message_id);

    for (const a of r.autoReplies) {
      await log(c.id, "auto_reply", `${a.subject ?? ""} — ${a.snippet ?? ""}`.trim());
      stats.autoReplies++;
    }

    const patch: Record<string, unknown> = { last_seen_message_id: r.lastSeenId };
    if (r.outcome === "bounce") {
      Object.assign(patch, { status: "bounced", next_send_at: null });
      const snippet = r.message?.snippet ?? "Mejl nije isporučen.";
      await log(c.id, isPolicyBlock(snippet) ? "blocked" : "bounce", snippet);
      stats.bounces++;
    } else if (r.outcome === "reply") {
      Object.assign(patch, { status: "replied", next_send_at: null });
      await log(c.id, "reply", r.message?.snippet ?? "");
      stats.replies++;
      try {
        if (labelId === undefined) labelId = await ensureLabel(accessToken, REPLY_LABEL);
        if (labelId) await addThreadLabel(accessToken, c.gmail_thread_id!, labelId);
      } catch (e) {
        if (e instanceof GmailAuthError) throw e;
        if (labelId === undefined) labelId = null;
        console.warn(`Labela ${REPLY_LABEL} nije dodata:`, e instanceof Error ? e.message : e);
      }
    }
    await admin.from("contacts").update(patch).eq("id", c.id);
  }
  return stats;
}

/** Adrese koje glavna aplikacija zabranjuje (postojeći kupac, odjava), sa razlogom. */
async function crmBlocked(admin: Admin, emails: string[]): Promise<Map<string, string>> {
  if (!emails.length) return new Map();
  const { data, error } = await admin.rpc("crm_blocked", { p_emails: emails });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { email: string; reason: string }[]).map((r) => [r.email, r.reason]));
}

async function stopForCrm(admin: Admin, c: Contact, reason: string, log: Log) {
  await admin.from("contacts").update({ status: "paused", next_send_at: null, notes: note(c.notes, `IZBAČENO: ${reason}, ne slati cold mejlove`) }).eq("id", c.id);
  await log(c.id, "skipped", reason);
}

function note(existing: string | null, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}
