"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { gmailThreadUrl } from "@/lib/gmailLink";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, type ContactStatus } from "@/lib/types";

export interface ReplyRow {
  contact_id: string;
  company: string | null;
  first_name: string | null;
  email: string;
  city: string | null;
  group_code: string | null;
  mailbox_email: string | null;
  gmail_thread_id: string | null;
  excerpt: string | null;
  replied_at: string | null;
}

const ACTIONS: { status: ContactStatus; label: string; done: string }[] = [
  { status: "interested", label: "Zainteresovan", done: "označen kao Zainteresovan" },
  { status: "not_interested", label: "Nije zainteresovan", done: "označen kao Nije zainteresovan" },
  { status: "unsubscribed", label: "Odjavljen", done: "odjavljen i dodat na listu za izuzimanje" },
];

export function ReplyList({ initial }: { initial: ReplyRow[] }) {
  const [rows, setRows] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mark(row: ReplyRow, status: ContactStatus, done: string) {
    setError(null);
    // Odjava automatski dodaje adresu na listu za izuzimanje (okidač u bazi).
    const { error } = await createClient().from("contacts").update({ status }).eq("id", row.contact_id);
    if (error) return setError(error.message);
    setRows((r) => r.filter((x) => x.contact_id !== row.contact_id));
    setMessage(`${row.company ?? row.email} je ${done}.`);
  }

  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      {message && !error && <Notice kind="success">{message}</Notice>}
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          Nema novih odgovora.
        </div>
      )}
      {rows.map((r) => {
        const link = gmailThreadUrl(r.mailbox_email, r.gmail_thread_id);
        return (
          <div key={r.contact_id} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{r.company ?? r.email}</p>
                <p className="text-xs text-muted break-all">
                  {r.first_name ? `${r.first_name} · ` : ""}
                  {r.email}
                  {r.city ? ` · ${r.city}` : ""}
                  {r.group_code ? ` · ${r.group_code}` : ""}
                </p>
              </div>
              <span className="text-xs text-muted">{formatDateTime(r.replied_at)}</span>
            </div>
            {r.excerpt && (
              <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm leading-relaxed break-words">„{r.excerpt}”</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ACTIONS.map((a) => (
                <Button key={a.status} variant={a.status === "interested" ? "primary" : "secondary"} onClick={() => mark(r, a.status, a.done)}>
                  {a.label}
                </Button>
              ))}
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="ml-auto text-sm text-accent hover:underline">
                  Otvori u Gmailu ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
