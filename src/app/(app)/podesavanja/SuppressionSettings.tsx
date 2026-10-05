"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, inputClass } from "@/components/ui";
import { fetchAll } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/types";
import { isValidEmail } from "@logic/email.ts";

interface Entry {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string;
  created_at: string;
}

const REASONS: Record<string, string> = { manual: "Ručno", bounce: "Bounce", unsubscribed: "Odjava" };

function fetchEntries() {
  const supabase = createClient();
  return fetchAll<Entry>((from, to) =>
    supabase.from("suppression").select("*").order("created_at", { ascending: false }).range(from, to),
  );
}

export function SuppressionSettings() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchEntries().then(setEntries), []);
  useEffect(() => {
    let alive = true;
    fetchEntries().then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, []);

  async function add() {
    setError(null);
    const v = value.trim().toLowerCase().replace(/^@/, "");
    if (!v) return;
    let row: { email?: string; domain?: string; reason: string };
    if (v.includes("@")) {
      if (!isValidEmail(v)) return setError("Neispravna adresa.");
      row = { email: v, reason: "manual" };
    } else {
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return setError("Neispravan domen (npr. firma.rs).");
      row = { domain: v, reason: "manual" };
    }
    const { error } = await supabase.from("suppression").insert(row);
    if (error) return setError(error.code === "23505" ? "Već je na listi." : error.message);
    setValue("");
    load();
  }

  async function remove(e: Entry) {
    if (!confirm(`Ukloniti ${e.email ?? e.domain} sa liste za izuzimanje?`)) return;
    const { error } = await supabase.from("suppression").delete().eq("id", e.id);
    if (error) return setError(error.message);
    load();
  }

  const shown = entries.filter((e) => !filter || (e.email ?? e.domain ?? "").includes(filter.toLowerCase()));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Lista za izuzimanje</h2>
      <p className="text-sm text-muted">
        Ove adrese i domeni nikad ne dobijaju mejl. Odjave i bounce se dodaju automatski; ručno možete dodati adresu ili ceo domen.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="adresa@firma.rs ili firma.rs"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="primary" onClick={add}>
          Dodaj
        </Button>
        <input className={`${inputClass} max-w-xs`} placeholder="Pretraga" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-border bg-surface text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Adresa / domen</th>
              <th className="px-4 py-2 font-medium">Razlog</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Dodato</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Lista je prazna.
                </td>
              </tr>
            )}
            {shown.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-2 break-all">{e.email ?? `ceo domen: ${e.domain}`}</td>
                <td className="px-4 py-2">{REASONS[e.reason] ?? e.reason}</td>
                <td className="hidden px-4 py-2 sm:table-cell">{formatDateTime(e.created_at)}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="text-xs text-danger hover:underline" onClick={() => remove(e)}>
                    Ukloni
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Ukupno: {entries.length}</p>
    </section>
  );
}
