import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/types";
import { MailboxSettings } from "./MailboxSettings";
import { SuppressionSettings } from "./SuppressionSettings";

export default async function PodesavanjaPage({ searchParams }: PageProps<"/podesavanja">) {
  const { gmail, razlog, nalog } = await searchParams;
  const gmailStatus =
    gmail === "ok"
      ? { ok: true }
      : gmail === "greska"
        ? { ok: false, reason: String(razlog ?? ""), account: nalog ? String(nalog) : undefined }
        : null;

  const supabase = await createClient();
  const { data: team } = await supabase.from("team_members").select("*").order("email");

  return (
    <>
      <PageHeader title="Podešavanja" description="Mailboxovi, članovi tima i lista za izuzimanje." />
      <div className="space-y-10">
        <MailboxSettings gmailStatus={gmailStatus} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Članovi tima</h2>
          <p className="text-sm text-muted">Pristup ima svako sa Google nalogom @metricop.com. Ovo su nalozi koji su se već prijavili.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {(team ?? []).map((m) => (
              <li key={m.email} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span className="font-medium break-all">{m.email}</span>
                <span className="text-xs text-muted">Poslednja prijava: {formatDateTime(m.last_sign_in_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        <SuppressionSettings />
      </div>
    </>
  );
}
