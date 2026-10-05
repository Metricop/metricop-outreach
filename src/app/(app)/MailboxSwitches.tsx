"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export interface MailboxSwitch {
  id: string;
  email: string;
  alias_email: string | null;
  market: "RS" | "SE";
  active: boolean;
  test_mode: boolean;
  test_email: string | null;
  paused_reason: string | null;
  connected: boolean;
}

export function MailboxSwitches({ initial }: { initial: MailboxSwitch[] }) {
  const [mailboxes, setMailboxes] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(m: MailboxSwitch) {
    setError(null);
    if (!m.active && !m.connected) return setError("Prvo povežite Gmail nalog u Podešavanjima.");
    const patch = m.active ? { active: false } : { active: true, paused_reason: null };
    const { error } = await createClient().from("mailboxes").update(patch).eq("id", m.id);
    if (error) return setError(error.message);
    setMailboxes((list) => list.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
  }

  if (mailboxes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
        Nema mailboxova. Dodajte ga u{" "}
        <Link href="/podesavanja" className="text-accent underline">
          Podešavanjima
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-3 md:grid-cols-2">
        {mailboxes.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.alias_email || m.email}</p>
                <p className="text-xs text-muted">{m.market === "RS" ? "Srbija" : "Švedska"}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={m.active}
                onClick={() => toggle(m)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  m.active ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"
                }`}
              >
                {m.active ? "Aktivno" : "Pauza"}
              </button>
            </div>
            {m.test_mode && (
              <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800">
                TEST MOD: svi mejlovi idu na {m.test_email}, naslov počinje sa [TEST].
              </p>
            )}
            {m.paused_reason && !m.active && (
              <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">⚠ Automatski pauzirano: {m.paused_reason}</p>
            )}
            {!m.connected && <p className="mt-3 text-xs text-danger">Gmail nije povezan.</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Aktivan mailbox šalje automatski svakih 15 minuta, pon–pet u radno vreme, samo za aktivne grupe.
      </p>
    </div>
  );
}
