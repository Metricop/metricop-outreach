// Nedeljna provera švedskih tendera za mernu opremu u bazi TED (poziva je pg_cron, zaglavlje x-cron-secret).
// Nove objave se čuvaju u outreach.tenders i šalju Nikoli jednim internim mejlom; svaka se javlja samo jednom.

import { refreshAccessToken, sendRaw } from "../_shared/gmail.ts";
import { corsHeaders, createAdmin, json, type Admin } from "../_shared/http.ts";
import { base64Url, buildMime } from "../_shared/logic/mime.ts";
import { localDate } from "../_shared/logic/schedule.ts";
import { buildTenderDigest, parseNotices, TED_FIELDS, TED_SEARCH_URL, tedQuery, type Tender } from "../_shared/logic/tenders.ts";

const REPORT_TO = Deno.env.get("OUTREACH_REPORT_TO") ?? "nikola@metricop.com";
const REPORT_FROM = "nikola@metricop-geo.com";
/** Prvi put (prazna tabela) gleda se 14 dana unazad; posle toga od poslednje sačuvane objave. */
const FIRST_LOOKBACK_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nepoznat zahtev." }, 400);
  try {
    const admin = createAdmin();
    const { data: allowed } = await admin.rpc("verify_cron_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
    if (!allowed) return json({ error: "Zabranjeno." }, 403);
    return json({ ok: true, ...(await checkTenders(admin)) });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Greška na serveru." }, 500);
  }
});

async function checkTenders(admin: Admin) {
  const { data: last } = await admin.from("tenders").select("published_on").order("published_on", { ascending: false }).limit(1);
  const since = last?.[0]?.published_on
    ? new Date(last[0].published_on)
    : new Date(Date.now() - FIRST_LOOKBACK_DAYS * 86_400_000);
  const sinceYmd = since.toISOString().slice(0, 10).replace(/-/g, "");

  const res = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: tedQuery(sinceYmd), fields: TED_FIELDS, limit: 100 }),
  });
  if (!res.ok) throw new Error(`TED pretraga nije uspela: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const found = parseNotices(await res.json());

  if (found.length) {
    const { error } = await admin.from("tenders").upsert(found, { onConflict: "publication_number", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const { data: pending } = await admin
    .from("tenders")
    .select("publication_number, published_on, buyer, title, notice_type, cpv, deadline, url")
    .is("notified_at", null)
    .order("published_on");
  const digest = buildTenderDigest(localDate(new Date(), "Europe/Belgrade"), (pending ?? []) as Tender[]);
  if (!digest) return { found: found.length, sent: false, reason: "Nema novih objava." };

  const err = await sendInternalMail(admin, digest.subject, digest.text);
  if (err) return { found: found.length, sent: false, reason: err };
  await admin
    .from("tenders")
    .update({ notified_at: new Date().toISOString() })
    .in("publication_number", pending!.map((t) => t.publication_number));
  return { found: found.length, sent: true, to: REPORT_TO, notices: pending!.length, subject: digest.subject };
}

/** Interni mejl sa srpskog naloga (kao dnevni izveštaj u run-cycle); vraća razlog ako ne može da se pošalje. */
async function sendInternalMail(admin: Admin, subject: string, text: string): Promise<string | null> {
  const { data: mailboxes } = await admin.from("mailboxes").select("id, email, alias_email").order("created_at");
  const from = mailboxes?.find((m) => m.email === REPORT_FROM) ?? mailboxes?.[0];
  if (!from) return "Nema mailboxa za slanje izveštaja.";
  const { data: refreshToken } = await admin.rpc("get_mailbox_token", { p_mailbox_id: from.id });
  if (!refreshToken) return `Mailbox ${from.email} nije povezan sa Gmailom.`;

  const accessToken = await refreshAccessToken(refreshToken);
  const html = `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;
  const raw = buildMime({ fromEmail: from.alias_email || from.email, fromName: "Metricop Outreach", to: REPORT_TO, subject, text, html });
  await sendRaw(accessToken, base64Url(raw));
  return null;
}
