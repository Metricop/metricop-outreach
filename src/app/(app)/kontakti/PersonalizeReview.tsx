"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Notice, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";

interface Row {
  contact: Contact;
  suggestion: string;
  accept: boolean;
}

/** Predlozi se prikazuju za odobrenje; u bazu ide samo ono što korisnik prihvati. */
export function PersonalizeReview({
  contacts,
  onClose,
  onSaved,
}: {
  contacts: Contact[] | null;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [state, setState] = useState<{ key: string; rows?: Row[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const key = (contacts ?? []).map((c) => c.id).join(",");
  const current = state?.key === key ? state : null;

  useEffect(() => {
    if (!contacts?.length) return;
    let alive = true;
    fetch("/api/personalizacija", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: contacts.map((c) => c.id) }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Predlog nije uspeo.");
        return data.suggestions as Record<string, string>;
      })
      .then((s) => {
        if (!alive) return;
        setState({
          key,
          rows: contacts.map((c) => ({ contact: c, suggestion: s[c.id] ?? "", accept: !!s[c.id] })),
        });
      })
      .catch((e) => alive && setState({ key, error: e instanceof Error ? e.message : "Greška" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(i: number, patch: Partial<Row>) {
    if (!current?.rows) return;
    const rows = current.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setState({ ...current, rows });
  }

  async function save() {
    if (!current?.rows) return;
    const accepted = current.rows.filter((r) => r.accept && r.suggestion.trim());
    setSaving(true);
    const supabase = createClient();
    for (const r of accepted) {
      const { error } = await supabase.from("contacts").update({ personalization: r.suggestion.trim() }).eq("id", r.contact.id);
      if (error) {
        setSaving(false);
        return setState({ ...current, error: error.message });
      }
    }
    setSaving(false);
    onSaved(accepted.length);
  }

  const accepted = current?.rows?.filter((r) => r.accept && r.suggestion.trim()).length ?? 0;

  return (
    <Drawer open={!!contacts?.length} onClose={onClose} title="Predlog personalizacije (Claude)">
      {!current ? (
        <p className="text-sm text-muted">Claude piše predloge za {contacts?.length} kontakata…</p>
      ) : current.error && !current.rows ? (
        <Notice kind="error">{current.error}</Notice>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Predlozi se ne upisuju dok ih ne prihvatite. Prazan predlog znači da u podacima nema ništa konkretno; Claude ne izmišlja.
          </p>
          {current.error && <Notice kind="error">{current.error}</Notice>}
          {current.rows!.map((r, i) => (
            <div key={r.contact.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.contact.company ?? r.contact.email}</p>
                  <p className="text-xs text-muted">
                    {r.contact.city ?? "—"}
                    {r.contact.personalization ? ` · sada: „${r.contact.personalization}”` : ""}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={r.accept}
                    disabled={!r.suggestion.trim()}
                    onChange={(e) => update(i, { accept: e.target.checked })}
                  />
                  Prihvati
                </label>
              </div>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="(nema predloga)"
                value={r.suggestion}
                onChange={(e) => update(i, { suggestion: e.target.value, accept: !!e.target.value.trim() })}
              />
            </div>
          ))}
          <Button variant="primary" onClick={save} disabled={saving || accepted === 0}>
            {saving ? "Čuvanje…" : `Sačuvaj prihvaćene (${accepted})`}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
