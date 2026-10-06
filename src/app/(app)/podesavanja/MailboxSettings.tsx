"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Field, Notice, inputClass } from "@/components/ui";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, type Mailbox } from "@/lib/types";
import { HARD_DAILY_CAP } from "@logic/limits.ts";
import { isValidEmail } from "@logic/email.ts";

type Draft = Omit<Mailbox, "id" | "created_at" | "paused_reason"> & { id?: string };

const TIMEZONES: Record<"RS" | "SE", string> = { RS: "Europe/Belgrade", SE: "Europe/Stockholm" };

const EMPTY: Draft = {
  email: "",
  alias_email: null,
  display_name: "",
  signature: "",
  market: "RS",
  daily_limit_new: 10,
  daily_limit_total: 20,
  per_run_limit: 3,
  send_hour_from: 9,
  send_hour_to: 17,
  timezone: TIMEZONES.RS,
  active: false,
  test_mode: true,
  test_email: "",
};

const GMAIL_ERRORS: Record<string, string> = {
  odbijeno: "Povezivanje je otkazano na Google ekranu.",
  istekao_zahtev: "Zahtev je istekao. Probajte ponovo.",
  nema_tokena: "Google nije vratio trajni pristup. Probajte ponovo.",
  dozvole: "Nisu odobrene sve tri Gmail dozvole. Probajte ponovo i štiklirajte sve.",
  pogresan_nalog: "Prijavili ste se drugim Gmail nalogom od adrese mailboxa.",
  nema_mailboxa: "Mailbox više ne postoji.",
  server: "Greška na serveru pri povezivanju.",
};

async function fetchMailboxes() {
  const supabase = createClient();
  const [m, c] = await Promise.all([
    supabase.from("mailboxes").select("*").order("market").order("email"),
    supabase.from("mailbox_connections").select("mailbox_id, updated_at"),
  ]);
  const connected: Record<string, string> = {};
  for (const r of c.data ?? []) connected[r.mailbox_id] = r.updated_at;
  return { mailboxes: (m.data ?? []) as Mailbox[], connected, error: m.error?.message ?? null };
}

export function MailboxSettings({ gmailStatus }: { gmailStatus: { ok: boolean; reason?: string; account?: string } | null }) {
  const supabase = createClient();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMailboxes>>>({ mailboxes: [], connected: {}, error: null });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetchMailboxes().then(setData), []);
  useEffect(() => {
    let alive = true;
    fetchMailboxes().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!draft) return;
    setError(null);
    const email = draft.email.trim().toLowerCase();
    const alias = (draft.alias_email ?? "").trim().toLowerCase() || null;
    const testEmail = (draft.test_email ?? "").trim().toLowerCase() || null;
    if (!isValidEmail(email)) return setError("Unesite ispravnu adresu Gmail naloga.");
    if (alias && !isValidEmail(alias)) return setError("Alias nije ispravna adresa.");
    if (testEmail && !isValidEmail(testEmail)) return setError("Test adresa nije ispravna.");
    if (draft.test_mode && !testEmail) return setError("Kad je uključen test mod, unesite test adresu.");
    if (draft.send_hour_from >= draft.send_hour_to) return setError("Radno vreme: početak mora biti pre kraja.");

    const row = {
      email,
      alias_email: alias,
      display_name: draft.display_name?.trim() || null,
      signature: draft.signature?.trim() || null,
      market: draft.market,
      daily_limit_new: Math.min(Math.max(0, Number(draft.daily_limit_new)), HARD_DAILY_CAP),
      daily_limit_total: Math.min(Math.max(0, Number(draft.daily_limit_total)), HARD_DAILY_CAP),
      per_run_limit: Math.min(Math.max(1, Number(draft.per_run_limit)), HARD_DAILY_CAP),
      send_hour_from: Number(draft.send_hour_from),
      send_hour_to: Number(draft.send_hour_to),
      timezone: draft.timezone,
      test_mode: draft.test_mode,
      test_email: testEmail,
    };
    setBusy(true);
    const res = draft.id
      ? await supabase.from("mailboxes").update(row).eq("id", draft.id)
      : await supabase.from("mailboxes").insert(row);
    setBusy(false);
    if (res.error) return setError(res.error.code === "23505" ? "Mailbox sa tom adresom već postoji." : res.error.message);
    setDraft(null);
    load();
  }

  async function connect(id: string) {
    setError(null);
    setBusy(true);
    try {
      const { url } = await callFunction<{ url: string }>("gmail-oauth", { mailbox_id: id });
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Povezivanje nije uspelo.");
    }
  }

  const { mailboxes, connected } = data;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Mailboxovi</h2>
        <Button variant="primary" onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
          Dodaj mailbox
        </Button>
      </div>

      {gmailStatus?.ok && <Notice kind="success">Gmail nalog je uspešno povezan.</Notice>}
      {gmailStatus && !gmailStatus.ok && (
        <Notice kind="error">
          {GMAIL_ERRORS[gmailStatus.reason ?? ""] ?? "Povezivanje nije uspelo."}
          {gmailStatus.account ? ` (prijavljen: ${gmailStatus.account})` : ""}
        </Notice>
      )}
      {error && !draft && <Notice kind="error">{error}</Notice>}

      {mailboxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
          Još nema mailboxova. Dodajte Gmail nalog iz kog se šalje (npr. za Srbiju).
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {mailboxes.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.alias_email || m.email}</p>
                  <p className="text-xs text-muted">
                    {m.market === "RS" ? "Srbija" : "Švedska"} · {m.display_name || "bez imena pošiljaoca"}
                    {m.alias_email ? ` · nalog ${m.email}` : ""}
                  </p>
                </div>
                {m.test_mode && (
                  <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">Test mod</span>
                )}
              </div>
              <p className="mt-3 text-xs">
                Gmail:{" "}
                {connected[m.id] ? (
                  <span className="text-emerald-700">povezan ({formatDateTime(connected[m.id])})</span>
                ) : (
                  <span className="text-danger">nije povezan</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                Limit: {m.daily_limit_new} novih / {m.daily_limit_total} ukupno dnevno · {m.per_run_limit} po krugu ·{" "}
                {m.send_hour_from}–{m.send_hour_to}h
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => { setError(null); setDraft({ ...m }); }}>Izmeni</Button>
                <Button variant={connected[m.id] ? "secondary" : "primary"} onClick={() => connect(m.id)} disabled={busy}>
                  {connected[m.id] ? "Poveži ponovo" : "Poveži Gmail"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Izmena mailboxa" : "Novi mailbox"}>
        {draft && (
          <div className="space-y-4">
            {error && <Notice kind="error">{error}</Notice>}
            <Field label="Gmail nalog" hint="Adresa Google Workspace naloga koji se povezuje (npr. nikola@metricop-geo.com).">
              <input className={inputClass} value={draft.email} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="Alias (opciono)" hint="Ako šaljete sa aliasa podešenog u Gmailu (Send mail as). Inače ostavite prazno.">
              <input className={inputClass} value={draft.alias_email ?? ""} onChange={(e) => setDraft({ ...draft, alias_email: e.target.value })} />
            </Field>
            <Field label="Ime pošiljaoca" hint="Npr. Nikola Petrović | Metricop">
              <input className={inputClass} value={draft.display_name ?? ""} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            </Field>
            <Field label="Potpis" hint="Dodaje se na kraj svakog mejla. Bez slika; najviše jedan link u mejlu.">
              <textarea className={inputClass} rows={4} value={draft.signature ?? ""} onChange={(e) => setDraft({ ...draft, signature: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tržište">
                <select
                  className={inputClass}
                  value={draft.market}
                  onChange={(e) => {
                    const market = e.target.value as "RS" | "SE";
                    setDraft({ ...draft, market, timezone: TIMEZONES[market] });
                  }}
                >
                  <option value="RS">Srbija</option>
                  <option value="SE">Švedska</option>
                </select>
              </Field>
              <Field label="Vremenska zona">
                <select className={inputClass} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                  <option value="Europe/Belgrade">Europe/Belgrade</option>
                  <option value="Europe/Stockholm">Europe/Stockholm</option>
                </select>
              </Field>
              <Field label="Šalje od (sat)">
                <input type="number" min={0} max={23} className={inputClass} value={draft.send_hour_from} onChange={(e) => setDraft({ ...draft, send_hour_from: Number(e.target.value) })} />
              </Field>
              <Field label="Šalje do (sat)">
                <input type="number" min={1} max={24} className={inputClass} value={draft.send_hour_to} onChange={(e) => setDraft({ ...draft, send_hour_to: Number(e.target.value) })} />
              </Field>
              <Field label="Novih dnevno">
                <input type="number" min={0} max={HARD_DAILY_CAP} className={inputClass} value={draft.daily_limit_new} onChange={(e) => setDraft({ ...draft, daily_limit_new: Number(e.target.value) })} />
              </Field>
              <Field label="Ukupno dnevno">
                <input type="number" min={0} max={HARD_DAILY_CAP} className={inputClass} value={draft.daily_limit_total} onChange={(e) => setDraft({ ...draft, daily_limit_total: Number(e.target.value) })} />
              </Field>
              <Field label="Po krugu (15 min)">
                <input type="number" min={1} max={10} className={inputClass} value={draft.per_run_limit} onChange={(e) => setDraft({ ...draft, per_run_limit: Number(e.target.value) })} />
              </Field>
            </div>
            <p className="text-xs text-muted">
              Prve dve nedelje važi najviše 10 novih i 20 ukupno dnevno. Tvrda granica je {HARD_DAILY_CAP} dnevno, bez obzira na podešavanje.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.test_mode} onChange={(e) => setDraft({ ...draft, test_mode: e.target.checked })} />
              Test mod (svi mejlovi idu na test adresu, naslov dobija [TEST])
            </label>
            <Field label="Test adresa">
              <input className={inputClass} value={draft.test_email ?? ""} onChange={(e) => setDraft({ ...draft, test_email: e.target.value })} />
            </Field>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Čuvanje…" : "Sačuvaj"}
            </Button>
          </div>
        )}
      </Drawer>
    </section>
  );
}
