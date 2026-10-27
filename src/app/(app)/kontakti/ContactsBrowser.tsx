"use client";

import { useEffect, useState } from "react";
import { Button, Notice, StatusBadge, inputClass } from "@/components/ui";
import { downloadText, toCsv, type CsvColumn } from "@/lib/csv";
import { fetchAll } from "@/lib/fetchAll";
import { MAX_PERSONALIZE } from "@/lib/personalize";
import { ContactPanel } from "./ContactPanel";
import { PersonalizeReview } from "./PersonalizeReview";
import { createClient } from "@/lib/supabase/client";
import {
  CONTACT_STATUSES,
  INTEREST_LABELS,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  type Contact,
  type ContactStatus,
  type Group,
  type InterestLevel,
} from "@/lib/types";

const PAGE_SIZE = 50;

interface Filters {
  q: string;
  group: string; // "" = sve, "none" = bez grupe
  status: string;
  city: string;
  tag: string;
  owner: string; // "" = svi, "none" = bez vlasnika
}

async function fetchContacts(filters: Filters, page: number) {
  const supabase = createClient();
  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("email")
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (filters.group === "none") query = query.is("group_id", null);
  else if (filters.group) query = query.eq("group_id", filters.group);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.owner === "none") query = query.is("owner_email", null);
  else if (filters.owner) query = query.eq("owner_email", filters.owner);
  const q = cleanQuery(filters.q);
  if (q) query = query.or(`company.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, count, error } = await query;
  return { contacts: (data ?? []) as Contact[], total: count ?? 0, error: error?.message ?? null };
}

const cleanQuery = (q: string) => q.replace(/[,()%*\\]/g, " ").trim();

async function fetchLookups() {
  const supabase = createClient();
  const [g, c, t, m] = await Promise.all([
    supabase.from("groups").select("*").order("priority").order("code"),
    supabase.from("contact_cities").select("city"),
    supabase.from("contact_tags").select("tag"),
    supabase.from("team_members").select("email").order("email"),
  ]);
  return {
    groups: (g.data ?? []) as Group[],
    cities: (c.data ?? []).map((r) => r.city as string),
    tags: (t.data ?? []).map((r) => r.tag as string),
    team: (m.data ?? []).map((r) => r.email as string),
  };
}

/** Kolone izvoza; isti nazivi kao u pogledu crm_contacts_v1 koji čita centralni CRM. */
interface ExportRow {
  id: string;
  company_id: string | null;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string;
  phone: string | null;
  country_code: string | null;
  city: string | null;
  status: ContactStatus;
  stage: string;
  interest_level: InterestLevel | null;
  next_step: string | null;
  next_contact_at: string | null;
  owner_email: string | null;
  tags: string[];
  group_code: string | null;
  mailbox_email: string | null;
  last_step: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  replied_at: string | null;
  external_ref: string | null;
  tier: string | null;
  source: string | null;
  notes: string | null;
}

const EXPORT_COLUMNS: CsvColumn<ExportRow>[] = [
  { header: "Firma", value: (r) => r.company_name },
  { header: "Ime", value: (r) => r.first_name },
  { header: "Prezime", value: (r) => r.last_name },
  { header: "Funkcija", value: (r) => r.title },
  { header: "Email", value: (r) => r.email },
  { header: "Telefon", value: (r) => r.phone },
  { header: "Država", value: (r) => r.country_code },
  { header: "Grad", value: (r) => r.city },
  { header: "Grupa", value: (r) => r.group_code },
  { header: "Mailbox", value: (r) => r.mailbox_email },
  { header: "Status", value: (r) => STATUS_LABELS[r.status] },
  { header: "Zainteresovanost", value: (r) => (r.interest_level ? INTEREST_LABELS[r.interest_level] : null) },
  { header: "Sledeći korak", value: (r) => r.next_step },
  { header: "Javi se ponovo", value: (r) => r.next_contact_at },
  { header: "Vlasnik", value: (r) => r.owner_email },
  { header: "Oznake", value: (r) => r.tags },
  { header: "Poslednji korak", value: (r) => r.last_step || null },
  { header: "Prvo slanje", value: (r) => formatDate(r.first_sent_at) },
  { header: "Poslednje slanje", value: (r) => formatDate(r.last_sent_at) },
  { header: "Odgovor", value: (r) => formatDate(r.replied_at) },
  { header: "Šifra", value: (r) => r.external_ref },
  { header: "Nivo", value: (r) => r.tier },
  { header: "Izvor", value: (r) => r.source },
  { header: "Beleške", value: (r) => r.notes },
  { header: "ID kontakta", value: (r) => r.id },
  { header: "ID firme", value: (r) => r.company_id },
];

export function ContactsBrowser({ initialOpenId = null }: { initialOpenId?: string | null }) {
  const supabase = createClient();
  const [filters, setFilters] = useState<Filters>({ q: "", group: "", status: "", city: "", tag: "", owner: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ key: string; contacts: Contact[]; total: number } | null>(null);
  const [lookups, setLookups] = useState<{ groups: Group[]; cities: string[]; tags: string[]; team: string[] }>({
    groups: [],
    cities: [],
    tags: [],
    team: [],
  });
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [personalizeFor, setPersonalizeFor] = useState<Contact[] | null>(null);

  const key = JSON.stringify({ filters, page, version });
  const contacts = result?.contacts ?? [];
  const total = result?.total ?? 0;
  const loading = result?.key !== key;
  const { groups, cities, tags, team } = lookups;

  // Pretraga kreće malo posle kucanja.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    fetchLookups().then((l) => alive && setLookups(l));
    return () => {
      alive = false;
    };
  }, [version]);

  useEffect(() => {
    let alive = true;
    fetchContacts(filters, page).then((r) => {
      if (!alive) return;
      setError(r.error);
      setResult({ key, contacts: r.contacts, total: r.total });
      setSelected(new Set());
    });
    return () => {
      alive = false;
    };
  }, [key, filters, page]);

  const reload = () => setVersion((v) => v + 1);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const groupCode = (id: string | null) => groups.find((g) => g.id === id)?.code ?? "—";
  const allOnPage = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulkUpdate(patch: Partial<Contact>, done: string) {
    const ids = [...selected];
    const { error } = await supabase.from("contacts").update(patch).in("id", ids);
    if (error) return setError(error.message);
    setMessage(`${done}: ${ids.length}`);
    reload();
  }

  async function bulkAddTag() {
    const tag = prompt("Oznaka za izabrane kontakte (npr. sajam-2026):")?.trim().toLowerCase();
    if (!tag) return;
    const chosen = contacts.filter((c) => selected.has(c.id) && !(c.tags ?? []).includes(tag));
    for (const c of chosen) {
      const { error } = await supabase.from("contacts").update({ tags: [...(c.tags ?? []), tag] }).eq("id", c.id);
      if (error) return setError(error.message);
    }
    setMessage(`Oznaka „${tag}” dodata: ${chosen.length}`);
    reload();
  }

  /** Izvoz svih kontakata koji odgovaraju filterima (ne samo ove strane). */
  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const code = filters.group && filters.group !== "none" ? groups.find((g) => g.id === filters.group)?.code : null;
      const q = cleanQuery(filters.q);
      const rows = await fetchAll<ExportRow>((from, to) => {
        let query = supabase.from("crm_contacts_v1").select("*").order("company_name").order("email").range(from, to);
        if (filters.group === "none") query = query.is("group_code", null);
        else if (code) query = query.eq("group_code", code);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.city) query = query.eq("city", filters.city);
        if (filters.tag) query = query.contains("tags", [filters.tag]);
        if (filters.owner === "none") query = query.is("owner_email", null);
        else if (filters.owner) query = query.eq("owner_email", filters.owner);
        if (q) query = query.or(`company_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
        return query;
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadText(`outreach-kontakti-${date}.csv`, toCsv(rows, EXPORT_COLUMNS));
      setMessage(`Izvezeno kontakata: ${rows.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Izvoz nije uspeo.");
    } finally {
      setExporting(false);
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!confirm(`Trajno obrisati ${ids.length} kontakata i svu njihovu istoriju? Ovo ne može da se vrati.`)) return;
    const { error } = await supabase.from("contacts").delete().in("id", ids);
    if (error) return setError(error.message);
    setMessage(`Obrisano: ${ids.length}`);
    reload();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <input
          className={inputClass}
          placeholder="Pretraga: firma, ime ili email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputClass} value={filters.group} onChange={(e) => setFilter("group", e.target.value)}>
          <option value="">Sve grupe</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code}
            </option>
          ))}
          <option value="none">Bez grupe</option>
        </select>
        <select className={inputClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">Svi statusi</option>
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.city} onChange={(e) => setFilter("city", e.target.value)}>
          <option value="">Svi gradovi</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.tag} onChange={(e) => setFilter("tag", e.target.value)}>
          <option value="">Sve oznake</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <select className={inputClass} value={filters.owner} onChange={(e) => setFilter("owner", e.target.value)}>
          <option value="">Svi vlasnici</option>
          {team.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="none">Bez vlasnika</option>
        </select>
      </div>

      <div className="flex justify-end">
        <Button onClick={exportCsv} disabled={exporting}>
          {exporting ? "Izvoz…" : "Izvezi u CSV (Excel)"}
        </Button>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {message && !error && <Notice kind="success">{message}</Notice>}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          groups={groups}
          onGroup={(gid) => bulkUpdate({ group_id: gid }, "Premešteno u grupu")}
          team={team}
          onPause={() => bulkUpdate({ status: "paused" }, "Pauzirano")}
          onOwner={(email) => bulkUpdate({ owner_email: email || null }, "Vlasnik promenjen")}
          onTag={bulkAddTag}
          onStatus={(s) => bulkUpdate({ status: s }, `Status „${STATUS_LABELS[s]}”`)}
          onDelete={bulkDelete}
          onPersonalize={() => {
            if (selected.size > MAX_PERSONALIZE) return setError(`Za predlog izaberite najviše ${MAX_PERSONALIZE} kontakata.`);
            setError(null);
            setPersonalizeFor(contacts.filter((c) => selected.has(c.id)));
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Izaberi sve na strani"
                  checked={allOnPage}
                  onChange={() => setSelected(allOnPage ? new Set() : new Set(contacts.map((c) => c.id)))}
                />
              </th>
              <th className="px-3 py-3 font-medium">Firma</th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell">Ime</th>
              <th className="hidden px-3 py-3 font-medium sm:table-cell">Email</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Grad</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Grupa</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell">Korak</th>
              <th className="hidden px-3 py-3 font-medium xl:table-cell">Poslednje slanje</th>
            </tr>
          </thead>
          <tbody>
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  Nema kontakata za izabrane filtere.
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-background"
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Izaberi ${c.email}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{c.company ?? "—"}</div>
                  {c.next_contact_at && (
                    <div className="text-xs text-accent">Javi se: {formatDate(c.next_contact_at)}</div>
                  )}
                  <div className="text-xs text-muted break-all sm:hidden">{c.email}</div>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  {c.title && <div className="text-xs text-muted">{c.title}</div>}
                </td>
                <td className="hidden px-3 py-3 break-all sm:table-cell">{c.email}</td>
                <td className="hidden px-3 py-3 md:table-cell">{c.city ?? "—"}</td>
                <td className="hidden px-3 py-3 md:table-cell">{groupCode(c.group_id)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">{c.step || "—"}</td>
                <td className="hidden px-3 py-3 xl:table-cell">{formatDateTime(c.last_sent_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted">
        <span>{loading ? "Učitavanje…" : `Ukupno: ${total}`}</span>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            Prethodna
          </Button>
          <span>
            {page + 1} / {pages}
          </span>
          <Button onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>
            Sledeća
          </Button>
        </div>
      </div>

      <PersonalizeReview
        contacts={personalizeFor}
        onClose={() => setPersonalizeFor(null)}
        onSaved={(n) => {
          setPersonalizeFor(null);
          setMessage(`Sačuvana personalizacija: ${n}`);
          reload();
        }}
      />

      <ContactPanel
        id={openId}
        groupCode={groupCode}
        teamEmails={team}
        onClose={() => setOpenId(null)}
        onChanged={reload}
        onOpen={setOpenId}
        onDeleted={() => {
          setOpenId(null);
          setMessage("Kontakt je trajno obrisan.");
          reload();
        }}
      />
    </div>
  );
}

function BulkBar({
  count,
  groups,
  team,
  onGroup,
  onPause,
  onOwner,
  onTag,
  onStatus,
  onDelete,
  onPersonalize,
  onClear,
}: {
  count: number;
  groups: Group[];
  team: string[];
  onGroup: (id: string) => void;
  onPause: () => void;
  onOwner: (email: string) => void;
  onTag: () => void;
  onStatus: (s: ContactStatus) => void;
  onDelete: () => void;
  onPersonalize: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
      <span className="font-medium text-accent">Izabrano: {count}</span>
      <select
        className={`${inputClass} w-auto`}
        value=""
        onChange={(e) => e.target.value && onGroup(e.target.value)}
        aria-label="Promeni grupu"
      >
        <option value="">Promeni grupu…</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.code}
          </option>
        ))}
      </select>
      <select
        className={`${inputClass} w-auto`}
        value=""
        onChange={(e) => e.target.value && onStatus(e.target.value as ContactStatus)}
        aria-label="Označi status"
      >
        <option value="">Označi status…</option>
        {CONTACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        className={`${inputClass} w-auto`}
        value=""
        onChange={(e) => e.target.value && onOwner(e.target.value === "none" ? "" : e.target.value)}
        aria-label="Vlasnik"
      >
        <option value="">Vlasnik…</option>
        {team.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="none">Bez vlasnika</option>
      </select>
      <Button onClick={onTag}>Dodaj oznaku</Button>
      <Button onClick={onPersonalize}>Predloži personalizaciju</Button>
      <Button onClick={onPause}>Pauziraj</Button>
      <Button variant="danger" onClick={onDelete}>
        Obriši
      </Button>
      <Button onClick={onClear}>Poništi izbor</Button>
    </div>
  );
}
