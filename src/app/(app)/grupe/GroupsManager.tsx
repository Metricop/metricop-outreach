"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Field, Notice, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { TIMEZONE_OPTIONS, type Group, type MailboxOption, type SequenceOption } from "@/lib/types";

type Draft = Omit<Group, "id"> & { id?: string };

const EMPTY: Draft = {
  code: "",
  name: "",
  description: "",
  mailbox_id: null,
  sequence_id: null,
  active: false,
  priority: 100,
  signature: null,
  timezone: null,
  send_hour_from: null,
  send_hour_to: null,
};

async function fetchGroupsData() {
  const supabase = createClient();
  const [g, m, s, c] = await Promise.all([
    supabase.from("groups").select("*").order("priority").order("code"),
    supabase.from("mailboxes").select("id, email, display_name, market").order("email"),
    supabase.from("sequences").select("id, name, language").order("name"),
    supabase.from("group_contact_counts").select("group_id, contacts"),
  ]);
  const counts: Record<string, number> = {};
  for (const row of c.data ?? []) counts[row.group_id] = row.contacts;
  return {
    error: g.error?.message ?? null,
    groups: (g.data ?? []) as Group[],
    mailboxes: (m.data ?? []) as MailboxOption[],
    sequences: (s.data ?? []) as SequenceOption[],
    counts,
  };
}

export function GroupsManager() {
  const supabase = createClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchGroupsData>>) => {
    if (d.error) setError(d.error);
    setGroups(d.groups);
    setMailboxes(d.mailboxes);
    setSequences(d.sequences);
    setCounts(d.counts);
  }, []);

  const load = useCallback(() => fetchGroupsData().then(apply), [apply]);

  useEffect(() => {
    let alive = true;
    fetchGroupsData().then((d) => alive && apply(d));
    return () => {
      alive = false;
    };
  }, [apply]);

  async function save() {
    if (!draft) return;
    setError(null);
    const code = draft.code.trim().toUpperCase();
    const name = draft.name.trim();
    if (!code || !name) return setError("Šifra i naziv su obavezni.");
    const from = draft.send_hour_from ?? null;
    const to = draft.send_hour_to ?? null;
    if ((from === null) !== (to === null)) return setError("Radno vreme grupe: popunite i početak i kraj, ili ostavite oba prazna.");
    if (from !== null && to !== null && from >= to) return setError("Radno vreme grupe: početak mora biti pre kraja.");
    setSaving(true);
    const row = {
      code,
      name,
      description: draft.description?.trim() || null,
      mailbox_id: draft.mailbox_id || null,
      sequence_id: draft.sequence_id || null,
      active: draft.active,
      priority: Number(draft.priority) || 0,
      signature: draft.signature?.trim() || null,
      timezone: draft.timezone || null,
      send_hour_from: from,
      send_hour_to: to,
    };
    const res = draft.id
      ? await supabase.from("groups").update(row).eq("id", draft.id)
      : await supabase.from("groups").insert(row);
    setSaving(false);
    if (res.error) {
      return setError(res.error.code === "23505" ? `Grupa sa šifrom ${code} već postoji.` : res.error.message);
    }
    setDraft(null);
    load();
  }

  async function remove() {
    if (!draft?.id) return;
    if (!confirm(`Obrisati grupu ${draft.code}?`)) return;
    const res = await supabase.from("groups").delete().eq("id", draft.id);
    if (res.error) return setError(res.error.message);
    setDraft(null);
    load();
  }

  const mailboxLabel = (id: string | null) => mailboxes.find((m) => m.id === id)?.email ?? "—";
  const sequenceLabel = (id: string | null) => sequences.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => { setError(null); setDraft({ ...EMPTY }); load(); }}>
          Nova grupa
        </Button>
      </div>

      {error && !draft && <Notice kind="error">{error}</Notice>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Šifra</th>
              <th className="px-4 py-3 font-medium">Naziv</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Mailbox</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Sekvenca</th>
              <th className="px-4 py-3 font-medium">Aktivna</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Prioritet</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Kontakata</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Još nema grupa. Napravite prvu, npr. GEO-BG.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr
                key={g.id}
                onClick={() => { setError(null); setDraft({ ...g }); load(); }}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-background"
              >
                <td className="px-4 py-3 font-medium">{g.code}</td>
                <td className="px-4 py-3">{g.name}</td>
                <td className="hidden px-4 py-3 md:table-cell">{mailboxLabel(g.mailbox_id)}</td>
                <td className="hidden px-4 py-3 md:table-cell">{sequenceLabel(g.sequence_id)}</td>
                <td className="px-4 py-3">{g.active ? "Da" : "Ne"}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{g.priority}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{counts[g.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Manji broj prioriteta = grupa se šalje ranije.</p>

      <Drawer open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? `Grupa ${draft.code}` : "Nova grupa"}>
        {draft && (
          <div className="space-y-4">
            {error && <Notice kind="error">{error}</Notice>}
            <Field label="Šifra" hint="Npr. GEO-BG">
              <input className={inputClass} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </Field>
            <Field label="Naziv">
              <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Opis">
              <textarea
                className={inputClass}
                rows={2}
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Mailbox" hint={mailboxes.length === 0 ? "Mailboxovi se povezuju u Podešavanjima (Faza 4)." : undefined}>
              <select
                className={inputClass}
                value={draft.mailbox_id ?? ""}
                onChange={(e) => setDraft({ ...draft, mailbox_id: e.target.value || null })}
              >
                <option value="">— nije izabran —</option>
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email} ({m.market})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sekvenca" hint={sequences.length === 0 ? "Sekvence se prave u Fazi 3." : undefined}>
              <select
                className={inputClass}
                value={draft.sequence_id ?? ""}
                onChange={(e) => setDraft({ ...draft, sequence_id: e.target.value || null })}
              >
                <option value="">— nije izabrana —</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.language})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioritet">
              <input
                type="number"
                className={inputClass}
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              />
            </Field>
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Posebno za ovu grupu</p>
              <p className="text-xs text-muted">Prazno polje znači da važi isto što i za mailbox. Koristi se kad isti nalog šalje drugom tržištu, npr. SAD.</p>
              <Field label="Potpis grupe">
                <textarea
                  className={inputClass}
                  rows={4}
                  value={draft.signature ?? ""}
                  onChange={(e) => setDraft({ ...draft, signature: e.target.value })}
                />
              </Field>
              <Field label="Vremenska zona grupe">
                <select className={inputClass} value={draft.timezone ?? ""} onChange={(e) => setDraft({ ...draft, timezone: e.target.value || null })}>
                  <option value="">— kao mailbox —</option>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Šalje od (sat)">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className={inputClass}
                    placeholder="kao mailbox"
                    value={draft.send_hour_from ?? ""}
                    onChange={(e) => setDraft({ ...draft, send_hour_from: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
                <Field label="Šalje do (sat)">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className={inputClass}
                    placeholder="kao mailbox"
                    value={draft.send_hour_to ?? ""}
                    onChange={(e) => setDraft({ ...draft, send_hour_to: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Aktivna (kontakti iz ove grupe se šalju)
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? "Čuvanje…" : "Sačuvaj"}
              </Button>
              {draft.id && (
                <Button
                  variant="danger"
                  onClick={remove}
                  disabled={(counts[draft.id] ?? 0) > 0}
                  title={(counts[draft.id] ?? 0) > 0 ? "Grupa ima kontakte" : undefined}
                >
                  Obriši grupu
                </Button>
              )}
            </div>
            {draft.id && (counts[draft.id] ?? 0) > 0 && (
              <p className="text-xs text-muted">Grupa sa kontaktima ne može da se obriše. Prvo ih premestite u drugu grupu.</p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
