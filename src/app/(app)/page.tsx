import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
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

const rate = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

export default async function PregledPage() {
  const supabase = await createClient();
  const [{ data: mailboxes }, { data: connections }, { data: summary }, { data: groups }, { data: daily }] = await Promise.all([
    supabase
      .from("mailboxes")
      .select("id, email, alias_email, market, active, test_mode, test_email, paused_reason")
      .order("market")
      .order("email"),
    supabase.from("mailbox_connections").select("mailbox_id"),
    supabase.from("stats_summary").select("*").single(),
    supabase.from("stats_groups").select("*").order("code"),
    supabase.from("stats_daily").select("*").order("day"),
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

        <DailyChart data={(daily ?? []) as DailyPoint[]} />

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
