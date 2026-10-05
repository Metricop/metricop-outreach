import { ComingSoon, PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { MailboxSwitches, type MailboxSwitch } from "./MailboxSwitches";

export default async function PregledPage() {
  const supabase = await createClient();
  const [{ data: mailboxes }, { data: connections }] = await Promise.all([
    supabase
      .from("mailboxes")
      .select("id, email, alias_email, market, active, test_mode, test_email, paused_reason")
      .order("market")
      .order("email"),
    supabase.from("mailbox_connections").select("mailbox_id"),
  ]);
  const connected = new Set((connections ?? []).map((c) => c.mailbox_id));
  const initial: MailboxSwitch[] = (mailboxes ?? []).map((m) => ({ ...m, connected: connected.has(m.id) }));

  return (
    <>
      <PageHeader title="Pregled" description="Slanje, odgovori i stanje mailboxova na jednom mestu." />
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mailboxovi</h2>
          <MailboxSwitches initial={initial} />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Brojke i grafikon</h2>
          <ComingSoon phase={6} />
        </section>
      </div>
    </>
  );
}
