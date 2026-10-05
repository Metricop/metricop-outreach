// Automatski krug za jedan mailbox (poziva ga pg_cron svakih 15 minuta).
// Redosled: bounce stopa -> (provera odgovora, Faza 5) -> radno vreme -> follow-upovi -> novi kontakti.

import { getMessageIdHeader, GmailAuthError, refreshAccessToken, sendRaw } from "../_shared/gmail.ts";
import type { Admin } from "../_shared/http.ts";
import { emailDomain } from "../_shared/logic/email.ts";
import { planRun, randomPauseMs, shouldPauseForBounces } from "../_shared/logic/limits.ts";
import { base64Url, buildMime } from "../_shared/logic/mime.ts";
import { prepareOutgoing, type OutgoingContact } from "../_shared/logic/outgoing.ts";
import { isWithinSendWindow, localDate } from "../_shared/logic/schedule.ts";
import { dueAction, stateAfterSend, type Step } from "../_shared/logic/sequence.ts";

const DAY_MS = 86_400_000;
const TIME_BUDGET_MS = 100_000; // Edge funkcija ima ograničeno vreme; ostatak ide u sledeći krug.

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

  // 2. Provera odgovora dolazi u Fazi 5.

  // 3. Radno vreme: pon–pet, u zoni mailboxa.
  if (!isWithinSendWindow(now, { timezone: mailbox.timezone, sendHourFrom: mailbox.send_hour_from, sendHourTo: mailbox.send_hour_to })) {
    return { skipped: "Van radnog vremena." };
  }

  const date = localDate(now, mailbox.timezone);
  const { data: counter } = await admin.from("daily_counters").select("sent_new, sent_total").eq("mailbox_id", mailboxId).eq("date", date).maybeSingle();
  const counts = { sentNew: counter?.sent_new ?? 0, sentTotal: counter?.sent_total ?? 0 };

  const { data: groups } = await admin.from("groups").select("id, active, priority, sequence_id").eq("mailbox_id", mailboxId);
  if (!groups?.length) return { skipped: "Mailbox nema dodeljenih grupa." };

  const seqIds = [...new Set(groups.map((g) => g.sequence_id).filter(Boolean))];
  const { data: stepRows } = seqIds.length
    ? await admin.from("sequence_steps").select("sequence_id, step_no, wait_days, subject, body").in("sequence_id", seqIds)
    : { data: [] as StepRow[] };
  const stepsOfGroup = (groupId: string): StepRow[] => {
    const seq = groups.find((g) => g.id === groupId)?.sequence_id;
    return ((stepRows ?? []) as StepRow[]).filter((s) => s.sequence_id === seq);
  };

  // 4. Follow-upovi kojima je vreme prošlo (i završetak sekvence posle poslednjeg čekanja).
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

  // 5. Limiti za ovaj krug.
  const limits = {
    dailyLimitNew: mailbox.daily_limit_new,
    dailyLimitTotal: mailbox.daily_limit_total,
    perRunLimit: mailbox.per_run_limit,
    createdAt: new Date(mailbox.created_at),
  };
  const plan = planRun(limits, counts, now, followups.length, 1000);

  // 6. Novi kontakti iz aktivnih grupa, po prioritetu grupe pa po datumu dodavanja.
  const queue: QueueItem[] = followups.slice(0, plan.followups);
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

    for (const c of candidates as Contact[]) {
      if (newLeft <= 0) break;
      if (blockedE.has(c.email) || blockedD.has(emailDomain(c.email))) {
        await admin.from("contacts").update({ status: "paused", notes: note(c.notes, "Preskočeno: adresa ili domen je na listi za izuzimanje.") }).eq("id", c.id);
        await log(c.id, "skipped", "Adresa ili domen je na listi za izuzimanje.");
        continue;
      }
      const steps = stepsOfGroup(g.id);
      queue.push({ contact: c, stepNo: Math.min(...steps.map((s) => s.step_no)), steps, isNew: true });
      newLeft--;
    }
  }

  if (queue.length === 0) return { sent: 0, finished, message: "Nema mejlova za slanje u ovom krugu." };

  // 7. Gmail pristup; istekao ili opozvan token pauzira mailbox.
  const { data: refreshToken } = await admin.rpc("get_mailbox_token", { p_mailbox_id: mailboxId });
  if (!refreshToken) return await pauseMailbox("Gmail nalog nije povezan. Povežite ga u Podešavanjima.");
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(refreshToken);
  } catch (e) {
    if (e instanceof GmailAuthError) return await pauseMailbox("Gmail veza je istekla ili je opozvana. Povežite nalog ponovo u Podešavanjima.");
    throw e;
  }

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
      const out = prepareOutgoing(mailbox, c, item.steps, item.stepNo);
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

  return { sent, finished, queued: queue.length };
}

function note(existing: string | null, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}
