// Dnevni interni izveštaj: posle slanja javlja odbijene i blokirane mejlove (i pauzirane mailboxe),
// da se slanje ne zaustavlja zbog jednog ili dva, a da se ipak zna pre sledeće ture.

import { refreshAccessToken, sendRaw } from "../_shared/gmail.ts";
import type { Admin } from "../_shared/http.ts";
import { buildDailyReport, type ReportEvent } from "../_shared/logic/report.ts";
import { base64Url, buildMime } from "../_shared/logic/mime.ts";
import { localDate } from "../_shared/logic/schedule.ts";

const REPORT_TZ = "Europe/Belgrade";
const REPORT_TO = Deno.env.get("OUTREACH_REPORT_TO") ?? "nikola@metricop.com";
/** Izveštaj ide sa ovog mailboxa (srpski nalog), ili sa prvog povezanog. */
const REPORT_FROM = "nikola@metricop-geo.com";

export async function sendDailyReport(admin: Admin) {
  const now = new Date();
  const date = localDate(now, REPORT_TZ);
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();

  const { data: rows } = await admin
    .from("events")
    .select("type, detail, contacts(company, email, groups(code)), mailboxes(email)")
    .gte("created_at", since)
    .limit(5000);
  // deno-lint-ignore no-explicit-any
  const events: ReportEvent[] = (rows ?? []).map((r: any) => ({
    type: r.type,
    detail: r.detail,
    company: r.contacts?.company ?? null,
    email: r.contacts?.email ?? null,
    group: r.contacts?.groups?.code ?? null,
    mailbox: r.mailboxes?.email ?? null,
  }));

  const report = buildDailyReport(date, events);
  if (!report) return { sent: false, reason: "Nema odbijenih ni pauza danas." };

  const { data: mailboxes } = await admin.from("mailboxes").select("id, email, alias_email").order("created_at");
  const from = mailboxes?.find((m) => m.email === REPORT_FROM) ?? mailboxes?.[0];
  if (!from) return { sent: false, reason: "Nema mailboxa za slanje izveštaja." };
  const { data: refreshToken } = await admin.rpc("get_mailbox_token", { p_mailbox_id: from.id });
  if (!refreshToken) return { sent: false, reason: `Mailbox ${from.email} nije povezan sa Gmailom.` };

  const accessToken = await refreshAccessToken(refreshToken);
  const html = `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap">${report.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;
  const raw = buildMime({
    fromEmail: from.alias_email || from.email,
    fromName: "Metricop Outreach",
    to: REPORT_TO,
    subject: report.subject,
    text: report.text,
    html,
  });
  await sendRaw(accessToken, base64Url(raw));
  return { sent: true, to: REPORT_TO, subject: report.subject };
}
