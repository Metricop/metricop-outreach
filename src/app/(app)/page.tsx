import { PageHeader } from "@/components/PageHeader";
import { queueFinishDate } from "@/lib/queue";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";
import { DailyChart, type DailyPoint } from "./DailyChart";
import { MailboxSwitches, type MailboxSwitch } from "./MailboxSwitches";

export const dynamic = "force-dynamic";

interface Summary {
  sent_today: number;
  sent_week: number;
  new_replies: number;
  interested: number;
  bounced: number;
  contacted: number;
  replied: number;
}

interface GroupStats {
  group_id: string;
  code: string;
  name: string;
  active: boolean;
  contacts: number;
  contacted: number;
  replied: number;
  interested: number;
}

interface QueueRow {
  group_id: string;
  code: string;
  active: boolean;
  daily_new_quota: number | null;
  queued: number;
  queued_by_quota: number;
  queued_dated: number;
  next_start: string | null;
  last_start: string | null;
  waiting_new: number;
}

interface Reminder {
  id: string;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  next_contact_at: string;
  next_step: string | null;
  owner_email: string | null;
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const rate = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

export default async function PregledPage() {
  const supabase = await createClient();
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Belgrade" }));
  const inWeek = new Date(today);
  inWeek.setDate(inWeek.getDate() + 7);
  const [
    { data: mailboxes },
    { data: connections },
    { data: summary },
    { data: groups },
    { data: daily },
    { data: queue },
    { data: reminders },
  ] = await Promise.all([
    supabase
      .from("mailboxes")
      .select("id, email, alias_email, market, active, test_mode, test_email, paused_reason")
      .order("market")
      .order("email"),
    supabase.from("mailbox_connections").select("mailbox_id"),
    supabase.from("stats_summary").select("*").single(),
    supabase.from("stats_groups").select("*").order("code"),
    supabase.from("stats_daily").select("*").order("day"),
    supabase.from("queue_overview").select("*").gt("queued", 0).order("code"),
    supabase
      .from("contacts")
      .select("id, company, first_name, last_name, email, next_contact_at, next_step, owner_email")
      .not("next_contact_at", "is", null)
      .lte("next_contact_at", isoDate(inWeek))
      .order("next_contact_at")
      .limit(30),
  ]);
  const connected = new Set((connections ?? []).map((c) => c.mailbox_id));
  const initial: MailboxSwitch[] = (mailboxes ?? []).map((m) => ({ ...m, connected: connected.has(m.id) }));
  const s = (summary ?? {}) as Partial<Summary>;

  const cards = [
    { label: "Poslato danas", value: s.sent_today ?? 0 },
    { label: "Poslato ove nedelje", value: s.sent_week ?? 0 },
    { label: "Novi odgovori", value: s.new_replies ?? 0, href: "/odgovori" },
    { label: "Zainteresovani", value: s.interested ?? 0 },
    { label: "Bounce", value: s.bounced ?? 0 },
    { label: "Stopa odgovora", value: rate(s.replied ?? 0, s.contacted ?? 0), hint: `${s.replied ?? 0} od ${s.contacted ?? 0} kontaktiranih` },
  ];

  return (
    <>
      <PageHeader title="Pregled" description="Slanje, odgovori i stanje mailboxova na jednom mestu." />
      <div className="space-y-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => {
            const body = (
              <>
                <p className="text-xs text-muted">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
                {c.hint && <p className="mt-0.5 text-xs text-muted">{c.hint}</p>}
              </>
            );
            return c.href ? (
              <a key={c.label} href={c.href} className="rounded-xl border border-border bg-surface p-4 hover:border-accent">
                {body}
              </a>
            ) : (
              <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
                {body}
              </div>
            );
          })}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mailboxovi</h2>
          <MailboxSwitches initial={initial} />
        </section>

        {(reminders ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Javi se ponovo</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              {((reminders ?? []) as Reminder[]).map((r) => {
                const late = r.next_contact_at <= isoDate(today);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <a href={`/kontakti?kontakt=${r.id}`} className="font-medium hover:underline">
                        {r.company ?? r.email}
                      </a>
                      <p className="text-xs text-muted">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}
                        {r.next_step ? ` · ${r.next_step}` : ""}
                        {r.owner_email ? ` · ${r.owner_email}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${late ? "text-danger" : "text-muted"}`}>
                      {late ? "Danas ili kasni: " : ""}
                      {formatDate(r.next_contact_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <DailyChart data={(daily ?? []) as DailyPoint[]} />

        {(queue ?? []).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Red čekanja</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Grupa</th>
                    <th className="px-4 py-3 text-right font-medium">Čeka</th>
                    <th className="px-4 py-3 font-medium">Kako se uključuju</th>
                    <th className="px-4 py-3 font-medium">Poslednji počinje</th>
                  </tr>
                </thead>
                <tbody>
                  {((queue ?? []) as QueueRow[]).map((q) => {
                    const finish = queueFinishDate(q.queued_by_quota, q.daily_new_quota, today);
                    const last = [finish ? isoDate(finish) : null, q.last_start].filter(Boolean).sort().at(-1) ?? null;
                    return (
                      <tr key={q.group_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <span className="font-medium">{q.code}</span>
                          {!q.active && <span className="ml-2 text-xs text-muted">(neaktivna)</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{q.queued}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {q.queued_by_quota > 0 &&
                            (q.daily_new_quota ? `${q.daily_new_quota} dnevno` : `${q.queued_by_quota} bez kvote (podesite u Grupama)`)}
                          {q.queued_by_quota > 0 && q.queued_dated > 0 && " · "}
                          {q.queued_dated > 0 && `${q.queued_dated} po datumu, sledeći ${formatDate(q.next_start)}`}
                        </td>
                        <td className="px-4 py-3">{formatDate(last)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              Svako radno jutro grupa sa kvotom dopuni kontakte „Novo“ do dnevnog broja, a kontakti sa datumom starta se uključe tog dana.
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Po grupama</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Grupa</th>
                  <th className="px-4 py-3 text-right font-medium">Kontakata</th>
                  <th className="px-4 py-3 text-right font-medium">Kontaktirano</th>
                  <th className="px-4 py-3 text-right font-medium">Odgovori</th>
                  <th className="px-4 py-3 text-right font-medium">Zainteresovani</th>
                  <th className="px-4 py-3 text-right font-medium">Stopa</th>
                </tr>
              </thead>
              <tbody>
                {((groups ?? []) as GroupStats[]).map((g) => (
                  <tr key={g.group_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{g.code}</span>
                      {!g.active && <span className="ml-2 text-xs text-muted">(neaktivna)</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.contacts}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.contacted}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.replied}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.interested}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{rate(g.replied, g.contacted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Kontaktirano = dobili bar jedan mejl. Stopa = odgovorili / kontaktirani. Sve brojke se računaju iz dnevnika događaja.
          </p>
        </section>
      </div>
    </>
  );
}
