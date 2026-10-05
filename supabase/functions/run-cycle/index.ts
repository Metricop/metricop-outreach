// Slanje mejlova.
// - action "cycle": automatski krug za jedan mailbox, poziva ga pg_cron (zaglavlje x-cron-secret).
// - action "test": test slanje iz uređivača šablona ("Pošalji test meni"), poziva prijavljeni član tima.

import { GmailAuthError, refreshAccessToken, sendRaw } from "../_shared/gmail.ts";
import { corsHeaders, createAdmin, getTeamUser, json } from "../_shared/http.ts";
import { composeEmail, SAMPLE_VARS } from "../_shared/logic/compose.ts";
import { base64Url, buildMime } from "../_shared/logic/mime.ts";
import { runMailboxCycle } from "./cycle.ts";

const LOCK_SECONDS = 600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nepoznat zahtev." }, 400);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "cycle") return await cycle(req, body.mailbox_id);
    if (body.action === "test") return await testSend(req, body);
    return json({ error: "Nepoznata akcija." }, 400);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Greška na serveru.";
    return json({ error: message }, e instanceof GmailAuthError ? 400 : 500);
  }
});

async function cycle(req: Request, mailboxId: string) {
  const admin = createAdmin();
  const { data: allowed } = await admin.rpc("verify_cron_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (!allowed) return json({ error: "Zabranjeno." }, 403);

  const { data: locked } = await admin.rpc("try_lock_mailbox", { p_mailbox_id: mailboxId, p_seconds: LOCK_SECONDS });
  if (!locked) return json({ ok: true, skipped: "Krug za ovaj mailbox je već u toku." });
  try {
    const result = await runMailboxCycle(admin, mailboxId);
    console.log(`run-cycle ${mailboxId}:`, JSON.stringify(result));
    return json({ ok: true, ...result });
  } finally {
    await admin.rpc("unlock_mailbox", { p_mailbox_id: mailboxId });
  }
}

interface TestBody {
  mailbox_id: string;
  sequence_id: string;
  step_no: number;
  contact_id?: string | null;
}

async function testSend(req: Request, body: TestBody) {
  const admin = createAdmin();
  const user = await getTeamUser(req, admin);
  if (!user) return json({ error: "Niste prijavljeni nalogom metricop.com." }, 401);

  const [{ data: mailbox }, { data: steps }] = await Promise.all([
    admin.from("mailboxes").select("*").eq("id", body.mailbox_id).single(),
    admin.from("sequence_steps").select("*").eq("sequence_id", body.sequence_id).order("step_no"),
  ]);
  if (!mailbox) return json({ error: "Izaberite mailbox." }, 400);
  const step = steps?.find((s) => s.step_no === Number(body.step_no));
  if (!step) return json({ error: "Korak ne postoji. Sačuvajte sekvencu pa probajte ponovo." }, 400);

  let vars = SAMPLE_VARS;
  if (body.contact_id) {
    const { data: c } = await admin.from("contacts").select("*").eq("id", body.contact_id).single();
    if (c) vars = { ime: c.first_name, firma: c.company, grad: c.city, personalizacija: c.personalization };
  }

  const email = composeEmail({
    stepNo: step.step_no,
    subject: step.subject,
    body: step.body,
    firstSubject: steps!.find((s) => s.step_no === 1)?.subject ?? null,
    vars,
    signature: mailbox.signature,
    testMode: true,
  });

  const { data: refreshToken } = await admin.rpc("get_mailbox_token", { p_mailbox_id: mailbox.id });
  if (!refreshToken) return json({ error: "Mailbox nije povezan sa Gmailom (Podešavanja → Poveži Gmail)." }, 400);

  const accessToken = await refreshAccessToken(refreshToken);
  const raw = buildMime({
    fromEmail: mailbox.alias_email || mailbox.email,
    fromName: mailbox.display_name,
    to: user.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  await sendRaw(accessToken, base64Url(raw));
  return json({ ok: true, to: user.email });
}
