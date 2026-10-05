"use client";

import { useEffect, useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Mailbox, SequenceOption, SequenceStep } from "@/lib/types";
import { composeEmail, SAMPLE_VARS } from "@logic/compose.ts";
import { lintStep } from "@logic/templateLint.ts";

const LANGUAGES: Record<string, string> = { sr: "Srpski", sv: "Švedski", en: "Engleski" };

interface StepDraft {
  step_no: number;
  wait_days: number;
  subject: string;
  body: string;
}

interface Draft {
  id: string;
  name: string;
  language: string;
  steps: StepDraft[];
}

async function fetchBase() {
  const supabase = createClient();
  const [s, m] = await Promise.all([
    supabase.from("sequences").select("id, name, language").order("name"),
    supabase.from("mailboxes").select("*").order("email"),
  ]);
  return { sequences: (s.data ?? []) as SequenceOption[], mailboxes: (m.data ?? []) as Mailbox[] };
}

async function fetchDraft(seq: SequenceOption): Promise<Draft> {
  const { data } = await createClient()
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", seq.id)
    .order("step_no");
  const steps = ((data ?? []) as SequenceStep[]).map((s) => ({
    step_no: s.step_no,
    wait_days: s.wait_days,
    subject: s.subject ?? "",
    body: s.body,
  }));
  return { id: seq.id, name: seq.name, language: seq.language, steps };
}

export function SequenceEditor({ onSequencesChanged }: { onSequencesChanged?: () => void } = {}) {
  const supabase = createClient();
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLang, setNewLang] = useState("sr");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pregled
  const [mailboxId, setMailboxId] = useState("");
  const [previewStep, setPreviewStep] = useState(1);
  const [contactQuery, setContactQuery] = useState("");
  const [contactOptions, setContactOptions] = useState<Contact[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    let alive = true;
    fetchBase().then((b) => {
      if (!alive) return;
      setSequences(b.sequences);
      setMailboxes(b.mailboxes);
      if (b.mailboxes[0]) setMailboxId(b.mailboxes[0].id);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const q = contactQuery.replace(/[,()%*\\]/g, " ").trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      supabase
        .from("contacts")
        .select("*")
        .or(`company.ilike.%${q}%,email.ilike.%${q}%,first_name.ilike.%${q}%`)
        .limit(8)
        .then(({ data }) => alive && setContactOptions((data ?? []) as Contact[]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactQuery]);

  async function open(seq: SequenceOption) {
    if (dirty && !confirm("Imate nesačuvane izmene. Odbaciti ih?")) return;
    setError(null);
    setMessage(null);
    setDraft(await fetchDraft(seq));
    setDirty(false);
    setPreviewStep(1);
  }

  async function create() {
    setError(null);
    const name = newName.trim();
    if (!name) return setError("Unesite naziv sekvence, npr. SEK-A.");
    const { data, error } = await supabase.from("sequences").insert({ name, language: newLang }).select().single();
    if (error) return setError(error.code === "23505" ? "Sekvenca sa tim nazivom već postoji." : error.message);
    await supabase.from("sequence_steps").insert({ sequence_id: data.id, step_no: 1, wait_days: 0, subject: "", body: "" });
    setNewName("");
    const base = await fetchBase();
    setSequences(base.sequences);
    onSequencesChanged?.();
    setDraft(await fetchDraft(data));
    setDirty(false);
  }

  function update(patch: Partial<Draft>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  }

  function updateStep(no: number, patch: Partial<StepDraft>) {
    if (!draft) return;
    update({ steps: draft.steps.map((s) => (s.step_no === no ? { ...s, ...patch } : s)) });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    setMessage(null);
    if (!draft.name.trim()) return setError("Naziv sekvence je obavezan.");
    setBusy(true);
    try {
      const s = await supabase.from("sequences").update({ name: draft.name.trim(), language: draft.language }).eq("id", draft.id);
      if (s.error) throw new Error(s.error.code === "23505" ? "Sekvenca sa tim nazivom već postoji." : s.error.message);
      const rows = draft.steps.map((st) => ({
        sequence_id: draft.id,
        step_no: st.step_no,
        wait_days: st.step_no === 1 ? 0 : Math.max(0, Number(st.wait_days) || 0),
        subject: st.step_no === 1 ? st.subject.trim() : null,
        body: st.body,
      }));
      const u = await supabase.from("sequence_steps").upsert(rows, { onConflict: "sequence_id,step_no" });
      if (u.error) throw new Error(u.error.message);
      const d = await supabase.from("sequence_steps").delete().eq("sequence_id", draft.id).gt("step_no", draft.steps.length);
      if (d.error) throw new Error(d.error.message);
      setDirty(false);
      setMessage("Sekvenca je sačuvana.");
      const base = await fetchBase();
      setSequences(base.sequences);
      onSequencesChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Čuvanje nije uspelo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSequence() {
    if (!draft) return;
    if (!confirm(`Obrisati sekvencu ${draft.name}? Grupe koje je koriste ostaće bez sekvence.`)) return;
    const { error } = await supabase.from("sequences").delete().eq("id", draft.id);
    if (error) return setError(error.message);
    setDraft(null);
    setDirty(false);
    const base = await fetchBase();
    setSequences(base.sequences);
    onSequencesChanged?.();
  }

  async function sendTest() {
    if (!draft) return;
    setError(null);
    setMessage(null);
    if (!mailboxId) return setError("Izaberite mailbox iz kog se šalje test.");
    setBusy(true);
    try {
      const res = await callFunction<{ to: string }>("run-cycle", {
        action: "test",
        mailbox_id: mailboxId,
        sequence_id: draft.id,
        step_no: previewStep,
        contact_id: contact?.id ?? null,
      });
      setMessage(`Test mejl (korak ${previewStep}) je poslat na ${res.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Slanje nije uspelo.");
    } finally {
      setBusy(false);
    }
  }

  const mailbox = mailboxes.find((m) => m.id === mailboxId) ?? null;
  const vars = contact
    ? { ime: contact.first_name, firma: contact.company, grad: contact.city, personalizacija: contact.personalization }
    : SAMPLE_VARS;
  const step = draft?.steps.find((s) => s.step_no === previewStep) ?? draft?.steps[0];
  const preview =
    draft && step
      ? composeEmail({
          stepNo: step.step_no,
          subject: step.subject,
          body: step.body,
          firstSubject: draft.steps[0]?.subject ?? null,
          vars,
          signature: mailbox?.signature,
        })
      : null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Sekvence (šabloni mejlova)</h2>

      <div className="flex flex-wrap items-center gap-2">
        {sequences.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => open(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              draft?.id === s.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface"
            }`}
          >
            {s.name} · {LANGUAGES[s.language] ?? s.language}
          </button>
        ))}
        {sequences.length === 0 && <span className="text-sm text-muted">Još nema sekvenci.</span>}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
        <Field label="Nova sekvenca">
          <input className={`${inputClass} w-40`} placeholder="npr. SEK-A" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </Field>
        <Field label="Jezik">
          <select className={`${inputClass} w-32`} value={newLang} onChange={(e) => setNewLang(e.target.value)}>
            {Object.entries(LANGUAGES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="primary" onClick={create}>
          Napravi
        </Button>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {message && !error && <Notice kind="success">{message}</Notice>}

      {draft && (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4">
              <Field label="Naziv">
                <input className={inputClass} value={draft.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Jezik">
                <select className={inputClass} value={draft.language} onChange={(e) => update({ language: e.target.value })}>
                  {Object.entries(LANGUAGES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="text-xs text-muted">
              Polja: <code>{"{{ime}}"}</code> <code>{"{{firma}}"}</code> <code>{"{{grad}}"}</code> <code>{"{{personalizacija}}"}</code>.
              Prazno ime briše i zarez ispred; prazna personalizacija briše ceo red. Potpis se dodaje automatski iz mailboxa.
            </p>

            {draft.steps.map((s) => {
              const warnings = lintStep({ stepNo: s.step_no, subject: s.subject, body: s.body, signature: mailbox?.signature });
              return (
                <div key={s.step_no} className="space-y-3 rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">Korak {s.step_no}</h3>
                    {s.step_no === 1 ? (
                      <span className="text-xs text-muted">šalje se odmah</span>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        čeka
                        <input
                          type="number"
                          min={0}
                          className={`${inputClass} w-16 py-1`}
                          value={s.wait_days}
                          onChange={(e) => updateStep(s.step_no, { wait_days: Number(e.target.value) })}
                        />
                        dana posle koraka {s.step_no - 1}
                      </label>
                    )}
                  </div>
                  {s.step_no === 1 ? (
                    <Field label="Naslov">
                      <input className={inputClass} value={s.subject} onChange={(e) => updateStep(1, { subject: e.target.value })} />
                    </Field>
                  ) : (
                    <p className="text-xs text-muted">Naslov: „Re: …” prvog koraka, u istoj niti.</p>
                  )}
                  <Field label="Tekst">
                    <textarea
                      className={`${inputClass} font-mono text-[13px]`}
                      rows={9}
                      value={s.body}
                      onChange={(e) => updateStep(s.step_no, { body: e.target.value })}
                    />
                  </Field>
                  {warnings.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-900">
                      {warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  update({ steps: [...draft.steps, { step_no: draft.steps.length + 1, wait_days: 3, subject: "", body: "" }] })
                }
              >
                Dodaj korak
              </Button>
              {draft.steps.length > 1 && (
                <Button onClick={() => update({ steps: draft.steps.slice(0, -1) })}>Ukloni poslednji korak</Button>
              )}
              <Button variant="primary" onClick={save} disabled={busy || !dirty}>
                {busy ? "Čuvanje…" : dirty ? "Sačuvaj sekvencu" : "Sačuvano"}
              </Button>
              <Button variant="danger" onClick={removeSequence}>
                Obriši sekvencu
              </Button>
            </div>
          </div>

          <div className="space-y-3 xl:sticky xl:top-6 xl:self-start">
            <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <h3 className="font-medium">Pregled mejla</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mailbox (potpis i pošiljalac)">
                  <select className={inputClass} value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
                    <option value="">— bez mailboxa —</option>
                    {mailboxes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.alias_email || m.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Korak">
                  <select className={inputClass} value={previewStep} onChange={(e) => setPreviewStep(Number(e.target.value))}>
                    {draft.steps.map((s) => (
                      <option key={s.step_no} value={s.step_no}>
                        Korak {s.step_no}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Kontakt za pregled" hint={contact ? undefined : "Bez izbora koristi se primer: Marko, Geodetski biro Primer, Novi Sad."}>
                {contact ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="truncate">
                      {contact.company ?? "—"} · {contact.email}
                    </span>
                    <button type="button" className="text-xs text-accent" onClick={() => setContact(null)}>
                      Promeni
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className={inputClass}
                      placeholder="Pretraži firmu ili email…"
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                    />
                    {contactQuery.trim().length >= 2 && contactOptions.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow">
                        {contactOptions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
                              onClick={() => {
                                setContact(c);
                                setContactQuery("");
                                setContactOptions([]);
                              }}
                            >
                              {c.company ?? "—"} <span className="text-muted">· {c.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Field>
            </div>

            {preview && (
              <div className="rounded-xl border border-border bg-surface text-sm">
                <div className="space-y-1 border-b border-border px-4 py-3">
                  <p>
                    <span className="text-muted">Od: </span>
                    {mailbox ? `${mailbox.display_name ? `${mailbox.display_name} ` : ""}<${mailbox.alias_email || mailbox.email}>` : "—"}
                  </p>
                  <p>
                    <span className="text-muted">Za: </span>
                    {contact?.email ?? "primer@firma.rs"}
                  </p>
                  <p>
                    <span className="text-muted">Naslov: </span>
                    <span className="font-medium">{preview.subject || "(bez naslova)"}</span>
                  </p>
                </div>
                <div className="whitespace-pre-wrap break-words px-4 py-4 leading-relaxed">{preview.text || "(prazno)"}</div>
              </div>
            )}

            <Button variant="primary" onClick={sendTest} disabled={busy || dirty || !mailboxId}>
              Pošalji test meni
            </Button>
            {dirty && <p className="text-xs text-muted">Prvo sačuvajte izmene, pa pošaljite test.</p>}
            {!mailboxId && <p className="text-xs text-muted">Za test je potreban povezan mailbox (Podešavanja).</p>}
          </div>
        </div>
      )}
    </section>
  );
}
