"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Field, Notice, StatusBadge, inputClass } from "@/components/ui";
import { ACTIVITY_TYPES, eventDetail, eventLabel, type ActivityType } from "@/lib/events";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import {
  COUNTRY_OPTIONS,
  INTEREST_LABELS,
  ROLE_LABELS,
  formatDateTime,
  type Company,
  type Contact,
  type ContactRole,
  type EventRow,
  type InterestLevel,
} from "@/lib/types";

type ContactDraft = Pick<
  Contact,
  | "first_name"
  | "last_name"
  | "title"
  | "phone"
  | "company"
  | "city"
  | "country_code"
  | "linkedin_url"
  | "tier"
  | "contact_role"
  | "owner_email"
  | "interest_level"
  | "next_step"
  | "next_contact_at"
  | "lost_reason"
  | "planned_start"
  | "personalization"
  | "notes"
> & { tags: string };

type CompanyDraft = Pick<
  Company,
  "name" | "legal_form" | "reg_no" | "vat_id" | "website" | "phone" | "email" | "address" | "city" | "zip" | "country_code" | "licenses" | "segment" | "notes"
>;

interface Loaded {
  id: string;
  contact: Contact;
  events: EventRow[];
  company: Company | null;
  colleagues: Pick<Contact, "id" | "first_name" | "last_name" | "email" | "status" | "title">[];
}

const ACTIVITY_LABELS: Record<ActivityType, string> = { note: "Beleška", call: "Poziv", meeting: "Sastanak" };

const nul = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function toDraft(c: Contact): ContactDraft {
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    title: c.title,
    phone: c.phone,
    company: c.company,
    city: c.city,
    country_code: c.country_code,
    linkedin_url: c.linkedin_url,
    tier: c.tier,
    contact_role: c.contact_role,
    owner_email: c.owner_email,
    interest_level: c.interest_level,
    next_step: c.next_step,
    next_contact_at: c.next_contact_at,
    lost_reason: c.lost_reason,
    planned_start: c.planned_start,
    personalization: c.personalization,
    notes: c.notes,
    tags: (c.tags ?? []).join(", "),
  };
}

function toCompanyDraft(c: Company): CompanyDraft {
  const { name, legal_form, reg_no, vat_id, website, phone, email, address, city, zip, country_code, licenses, segment, notes } = c;
  return { name, legal_form, reg_no, vat_id, website, phone, email, address, city, zip, country_code, licenses, segment, notes };
}

export function ContactPanel({
  id,
  groupCode,
  teamEmails,
  onClose,
  onChanged,
  onDeleted,
  onOpen,
}: {
  id: string | null;
  groupCode: (id: string | null) => string;
  teamEmails: string[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onOpen: (id: string) => void;
}) {
  const supabase = createClient();
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<ContactDraft | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft | null>(null);
  const [activity, setActivity] = useState<{ type: ActivityType; text: string }>({ type: "note", text: "" });
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = data && data.id === id ? data : null;
  const saved = savedMsg && savedMsg.id === id ? savedMsg.text : null;
  const setSaved = (text: string) => id && setSavedMsg({ id, text });
  const contact = current?.contact ?? null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).single(),
        supabase.from("events").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      ]);
      const ct = c.data as Contact | null;
      if (!ct) return;
      const [co, col] = ct.company_id
        ? await Promise.all([
            supabase.from("companies").select("*").eq("id", ct.company_id).single(),
            supabase
              .from("contacts")
              .select("id, first_name, last_name, email, status, title")
              .eq("company_id", ct.company_id)
              .neq("id", id)
              .order("email"),
          ])
        : [{ data: null }, { data: [] }];
      if (!alive) return;
      setData({
        id,
        contact: ct,
        events: (e.data ?? []) as EventRow[],
        company: (co.data as Company | null) ?? null,
        colleagues: (col.data ?? []) as Loaded["colleagues"],
      });
      setDraft(toDraft(ct));
      setCompanyDraft(co.data ? toCompanyDraft(co.data as Company) : null);
      setError(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version]);

  const reload = () => {
    setVersion((v) => v + 1);
    onChanged();
  };

  async function saveContact() {
    if (!contact || !draft) return;
    setBusy(true);
    setError(null);
    const tags = [...new Set(draft.tags.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
    const patch = {
      first_name: nul(draft.first_name),
      last_name: nul(draft.last_name),
      title: nul(draft.title),
      phone: nul(draft.phone),
      company: nul(draft.company),
      city: nul(draft.city),
      country_code: nul(draft.country_code),
      linkedin_url: nul(draft.linkedin_url),
      tier: nul(draft.tier),
      contact_role: draft.contact_role || null,
      owner_email: nul(draft.owner_email),
      interest_level: draft.interest_level || null,
      next_step: nul(draft.next_step),
      next_contact_at: draft.next_contact_at || null,
      lost_reason: nul(draft.lost_reason),
      planned_start: draft.planned_start || null,
      personalization: nul(draft.personalization),
      notes: nul(draft.notes),
      tags,
    };
    const { error } = await supabase.from("contacts").update(patch).eq("id", contact.id);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved("Kontakt je sačuvan.");
    reload();
  }

  async function saveCompany() {
    if (!current?.company || !companyDraft) return;
    if (!nul(companyDraft.name)) return setError("Firma mora da ima naziv.");
    setBusy(true);
    setError(null);
    const patch = Object.fromEntries(Object.entries(companyDraft).map(([k, v]) => [k, nul(v as string | null)]));
    const { error } = await supabase.from("companies").update(patch).eq("id", current.company.id);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved("Firma je sačuvana.");
    reload();
  }

  async function addActivity() {
    if (!contact || !activity.text.trim()) return;
    setBusy(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("events").insert({
      contact_id: contact.id,
      type: activity.type,
      detail: activity.text.trim(),
      created_by: auth.user?.email?.toLowerCase() ?? null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setActivity({ type: activity.type, text: "" });
    setSaved(`${ACTIVITY_LABELS[activity.type]} je upisan${activity.type === "note" ? "a" : ""}.`);
    reload();
  }

  async function erase() {
    if (!contact) return;
    if (!confirm(`Trajno obrisati ${contact.email} i svu istoriju (GDPR)? Ovo ne može da se vrati.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
    if (error) return alert(error.message);
    onDeleted();
  }

  const set = <K extends keyof ContactDraft>(k: K, v: ContactDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setCo = <K extends keyof CompanyDraft>(k: K, v: CompanyDraft[K]) =>
    setCompanyDraft((d) => (d ? { ...d, [k]: v } : d));

  const info: [string, string | number | null][] = contact
    ? [
        ["Email", contact.email],
        ["Grupa", groupCode(contact.group_id)],
        ["Šifra", contact.external_ref],
        ["Korak", contact.step || null],
        ["Izvor", contact.source],
        ["Poslednje slanje", formatDateTime(contact.last_sent_at)],
        ["Sledeće slanje", formatDateTime(contact.next_send_at)],
        ["Dodat", formatDateTime(contact.created_at)],
      ]
    : [];

  return (
    <Drawer open={!!id} onClose={onClose} title={contact?.company || contact?.email || "Kontakt"}>
      {!contact || !draft ? (
        <p className="text-sm text-muted">Učitavanje…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <StatusBadge status={contact.status} />
            {contact.tags?.length > 0 && (
              <span className="ml-2 text-xs text-muted">{contact.tags.map((t) => `#${t}`).join(" ")}</span>
            )}
            <dl className="mt-4 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
              {info.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words whitespace-pre-line">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {error && <Notice kind="error">{error}</Notice>}
          {saved && !error && <Notice kind="success">{saved}</Notice>}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Dalji koraci</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Zainteresovanost">
                <select
                  className={inputClass}
                  value={draft.interest_level ?? ""}
                  onChange={(e) => set("interest_level", (e.target.value || null) as InterestLevel | null)}
                >
                  <option value="">—</option>
                  {Object.entries(INTEREST_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Javi se ponovo" hint="Podsetnik na Pregledu.">
                <input
                  type="date"
                  className={inputClass}
                  value={draft.next_contact_at ?? ""}
                  onChange={(e) => set("next_contact_at", e.target.value || null)}
                />
              </Field>
              <Field label="Sledeći korak">
                <input className={inputClass} value={draft.next_step ?? ""} onChange={(e) => set("next_step", e.target.value)} />
              </Field>
              <Field label="Vlasnik kontakta">
                <select className={inputClass} value={draft.owner_email ?? ""} onChange={(e) => set("owner_email", e.target.value || null)}>
                  <option value="">—</option>
                  {[...new Set([...teamEmails, ...(draft.owner_email ? [draft.owner_email] : [])])].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Razlog za „ne“">
                <input className={inputClass} value={draft.lost_reason ?? ""} onChange={(e) => set("lost_reason", e.target.value)} />
              </Field>
              <Field label="Oznake" hint="Odvojene zarezom, npr. sajam, partner.">
                <input className={inputClass} value={draft.tags} onChange={(e) => set("tags", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Podaci kontakta</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ime">
                <input className={inputClass} value={draft.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
              </Field>
              <Field label="Prezime">
                <input className={inputClass} value={draft.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
              </Field>
              <Field label="Funkcija">
                <input className={inputClass} value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} />
              </Field>
              <Field label="Telefon">
                <input className={inputClass} value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Firma (naziv u mejlu)">
                <input className={inputClass} value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} />
              </Field>
              <Field label="Grad">
                <input className={inputClass} value={draft.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Država">
                <select className={inputClass} value={draft.country_code ?? ""} onChange={(e) => set("country_code", e.target.value || null)}>
                  <option value="">—</option>
                  {[...new Set([...COUNTRY_OPTIONS, ...(draft.country_code ? [draft.country_code] : [])])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="LinkedIn">
                <input className={inputClass} value={draft.linkedin_url ?? ""} onChange={(e) => set("linkedin_url", e.target.value)} />
              </Field>
              <Field label="Nivo (K1–K4)">
                <input className={inputClass} value={draft.tier ?? ""} onChange={(e) => set("tier", e.target.value)} />
              </Field>
              <Field label="Uloga u firmi">
                <select
                  className={inputClass}
                  value={draft.contact_role ?? ""}
                  onChange={(e) => set("contact_role", (e.target.value || null) as ContactRole | null)}
                >
                  <option value="">—</option>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start iz reda čekanja" hint="Prazno = po dnevnoj kvoti grupe.">
                <input
                  type="date"
                  className={inputClass}
                  value={draft.planned_start ?? ""}
                  onChange={(e) => set("planned_start", e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="Personalizacija">
              <textarea
                className={inputClass}
                rows={2}
                value={draft.personalization ?? ""}
                onChange={(e) => set("personalization", e.target.value)}
              />
            </Field>
            <Field label="Beleške">
              <textarea className={inputClass} rows={4} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            <Button variant="primary" onClick={saveContact} disabled={busy}>
              Sačuvaj kontakt
            </Button>
          </section>

          {current?.company && companyDraft && (
            <section className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Firma</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Naziv">
                  <input className={inputClass} value={companyDraft.name ?? ""} onChange={(e) => setCo("name", e.target.value)} />
                </Field>
                <Field label="Pravna forma">
                  <input className={inputClass} value={companyDraft.legal_form ?? ""} onChange={(e) => setCo("legal_form", e.target.value)} />
                </Field>
                <Field label="Matični broj / Org.nr">
                  <input className={inputClass} value={companyDraft.reg_no ?? ""} onChange={(e) => setCo("reg_no", e.target.value)} />
                </Field>
                <Field label="PIB / VAT">
                  <input className={inputClass} value={companyDraft.vat_id ?? ""} onChange={(e) => setCo("vat_id", e.target.value)} />
                </Field>
                <Field label="Sajt">
                  <input className={inputClass} value={companyDraft.website ?? ""} onChange={(e) => setCo("website", e.target.value)} />
                </Field>
                <Field label="Telefon firme">
                  <input className={inputClass} value={companyDraft.phone ?? ""} onChange={(e) => setCo("phone", e.target.value)} />
                </Field>
                <Field label="Opšti mejl">
                  <input className={inputClass} value={companyDraft.email ?? ""} onChange={(e) => setCo("email", e.target.value)} />
                </Field>
                <Field label="Adresa">
                  <input className={inputClass} value={companyDraft.address ?? ""} onChange={(e) => setCo("address", e.target.value)} />
                </Field>
                <Field label="Poštanski broj">
                  <input className={inputClass} value={companyDraft.zip ?? ""} onChange={(e) => setCo("zip", e.target.value)} />
                </Field>
                <Field label="Grad">
                  <input className={inputClass} value={companyDraft.city ?? ""} onChange={(e) => setCo("city", e.target.value)} />
                </Field>
                <Field label="Država">
                  <select
                    className={inputClass}
                    value={companyDraft.country_code ?? ""}
                    onChange={(e) => setCo("country_code", e.target.value || null)}
                  >
                    <option value="">—</option>
                    {[...new Set([...COUNTRY_OPTIONS, ...(companyDraft.country_code ? [companyDraft.country_code] : [])])].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Licence RGZ">
                  <input className={inputClass} value={companyDraft.licenses ?? ""} onChange={(e) => setCo("licenses", e.target.value)} />
                </Field>
                <Field label="Segment">
                  <input className={inputClass} value={companyDraft.segment ?? ""} onChange={(e) => setCo("segment", e.target.value)} />
                </Field>
              </div>
              <Field label="Beleške o firmi">
                <textarea className={inputClass} rows={2} value={companyDraft.notes ?? ""} onChange={(e) => setCo("notes", e.target.value)} />
              </Field>
              <Button onClick={saveCompany} disabled={busy}>
                Sačuvaj firmu
              </Button>
              {current.colleagues.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted">Drugi kontakti iz ove firme</p>
                  <ul className="space-y-1 text-sm">
                    {current.colleagues.map((k) => (
                      <li key={k.id} className="flex items-center justify-between gap-2">
                        <button type="button" className="truncate text-left text-accent hover:underline" onClick={() => onOpen(k.id)}>
                          {[k.first_name, k.last_name].filter(Boolean).join(" ") || k.email}
                          {k.title ? ` · ${k.title}` : ""}
                        </button>
                        <StatusBadge status={k.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Upiši aktivnost</h3>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((t) => (
                <Button
                  key={t}
                  variant={activity.type === t ? "primary" : "secondary"}
                  onClick={() => setActivity((a) => ({ ...a, type: t }))}
                >
                  {ACTIVITY_LABELS[t]}
                </Button>
              ))}
            </div>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Npr. Razgovarali telefonom, traže ponudu za 2 GNSS prijemnika."
              value={activity.text}
              onChange={(e) => setActivity((a) => ({ ...a, text: e.target.value }))}
            />
            <Button variant="primary" onClick={addActivity} disabled={busy || !activity.text.trim()}>
              Upiši
            </Button>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Istorija</h3>
            {current!.events.length === 0 ? (
              <p className="text-sm text-muted">Još nema događaja.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {current!.events.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{eventLabel(e.type)}</span>
                      <span className="text-xs text-muted">{formatDateTime(e.created_at)}</span>
                    </div>
                    {e.detail && <p className="mt-1 break-words whitespace-pre-line text-muted">{eventDetail(e.type, e.detail)}</p>}
                    {e.created_by && <p className="mt-1 text-xs text-muted">{e.created_by}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Prepiska iz Gmaila</h3>
            {contact.gmail_thread_id ? (
              <ThreadView contactId={contact.id} />
            ) : (
              <p className="text-sm text-muted">Kontaktu još nije poslat nijedan mejl.</p>
            )}
          </section>

          <section className="border-t border-border pt-4">
            <Button variant="danger" onClick={erase}>
              Trajno obriši kontakt i istoriju
            </Button>
            <p className="mt-2 text-xs text-muted">
              Za zahteve za brisanje podataka (GDPR).
            </p>
          </section>
        </div>
      )}
    </Drawer>
  );
}

interface ThreadMessage {
  id: string;
  from: string | null;
  subject: string | null;
  date: string | null;
  text: string;
}

function ThreadView({ contactId }: { contactId: string }) {
  const [state, setState] = useState<{ id: string; messages?: ThreadMessage[]; error?: string } | null>(null);
  const current = state?.id === contactId ? state : null;

  useEffect(() => {
    let alive = true;
    callFunction<{ messages: ThreadMessage[] }>("run-cycle", { action: "thread", contact_id: contactId })
      .then((r) => alive && setState({ id: contactId, messages: r.messages }))
      .catch((e) => alive && setState({ id: contactId, error: e instanceof Error ? e.message : "Greška" }));
    return () => {
      alive = false;
    };
  }, [contactId]);

  if (!current) return <p className="text-sm text-muted">Učitavanje prepiske…</p>;
  if (current.error) return <p className="text-sm text-danger">{current.error}</p>;
  if (!current.messages?.length) return <p className="text-sm text-muted">Nit je prazna.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {current.messages.map((m) => (
        <li key={m.id} className="rounded-lg border border-border px-3 py-2">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span className="break-all">{m.from}</span>
            <span>{formatDateTime(m.date)}</span>
          </div>
          <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words">{m.text}</p>
        </li>
      ))}
    </ul>
  );
}
