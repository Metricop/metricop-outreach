"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Notice, StatusBadge, inputClass } from "@/components/ui";
import { eventLabel } from "@/lib/events";
import { callFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";
import {
  CONTACT_STATUSES,
  STATUS_LABELS,
  formatDateTime,
  type Contact,
  type ContactStatus,
  type EventRow,
  type Group,
} from "@/lib/types";

const PAGE_SIZE = 50;

interface Filters {
  q: string;
  group: string; // "" = sve, "none" = bez grupe
  status: string;
  city: string;
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
  const q = filters.q.replace(/[,()%*\\]/g, " ").trim();
  if (q) query = query.or(`company.ilike.%${q}%,first_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, count, error } = await query;
  return { contacts: (data ?? []) as Contact[], total: count ?? 0, error: error?.message ?? null };
}

async function fetchLookups() {
  const supabase = createClient();
  const [g, c] = await Promise.all([
    supabase.from("groups").select("*").order("priority").order("code"),
    supabase.from("contact_cities").select("city"),
  ]);
  return { groups: (g.data ?? []) as Group[], cities: (c.data ?? []).map((r) => r.city as string) };
}

export function ContactsBrowser() {
  const supabase = createClient();
  const [filters, setFilters] = useState<Filters>({ q: "", group: "", status: "", city: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ key: string; contacts: Contact[]; total: number } | null>(null);
  const [lookups, setLookups] = useState<{ groups: Group[]; cities: string[] }>({ groups: [], cities: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const key = JSON.stringify({ filters, page, version });
  const contacts = result?.contacts ?? [];
  const total = result?.total ?? 0;
  const loading = result?.key !== key;
  const { groups, cities } = lookups;

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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {message && !error && <Notice kind="success">{message}</Notice>}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          groups={groups}
          onGroup={(gid) => bulkUpdate({ group_id: gid }, "Premešteno u grupu")}
          onPause={() => bulkUpdate({ status: "paused" }, "Pauzirano")}
          onStatus={(s) => bulkUpdate({ status: s }, `Status „${STATUS_LABELS[s]}”`)}
          onDelete={bulkDelete}
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
                  <div className="text-xs text-muted break-all sm:hidden">{c.email}</div>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">{c.first_name ?? "—"}</td>
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

      <ContactPanel
        id={openId}
        groupCode={groupCode}
        onClose={() => setOpenId(null)}
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
  onGroup,
  onPause,
  onStatus,
  onDelete,
  onClear,
}: {
  count: number;
  groups: Group[];
  onGroup: (id: string) => void;
  onPause: () => void;
  onStatus: (s: ContactStatus) => void;
  onDelete: () => void;
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
      <Button onClick={onPause}>Pauziraj</Button>
      <Button variant="danger" onClick={onDelete}>
        Obriši
      </Button>
      <Button onClick={onClear}>Poništi izbor</Button>
    </div>
  );
}

function ContactPanel({
  id,
  groupCode,
  onClose,
  onDeleted,
}: {
  id: string | null;
  groupCode: (id: string | null) => string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const [data, setData] = useState<{ id: string; contact: Contact | null; events: EventRow[] } | null>(null);
  const contact = data && data.id === id ? data.contact : null;
  const events = data && data.id === id ? data.events : [];

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      supabase.from("contacts").select("*").eq("id", id).single(),
      supabase.from("events").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    ]).then(([c, e]) => {
      if (alive) setData({ id, contact: c.data, events: e.data ?? [] });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function erase() {
    if (!contact) return;
    if (!confirm(`Trajno obrisati ${contact.email} i svu istoriju (GDPR)? Ovo ne može da se vrati.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
    if (error) return alert(error.message);
    onDeleted();
  }

  const rows: [string, string | number | null][] = contact
    ? [
        ["Firma", contact.company],
        ["Ime", contact.first_name],
        ["Email", contact.email],
        ["Grad", contact.city],
        ["Grupa", groupCode(contact.group_id)],
        ["Korak", contact.step || null],
        ["Personalizacija", contact.personalization],
        ["Izvor", contact.source],
        ["Poslednje slanje", formatDateTime(contact.last_sent_at)],
        ["Sledeće slanje", formatDateTime(contact.next_send_at)],
        ["Beleške", contact.notes],
        ["Dodat", formatDateTime(contact.created_at)],
      ]
    : [];

  return (
    <Drawer open={!!id} onClose={onClose} title={contact?.company || contact?.email || "Kontakt"}>
      {!contact ? (
        <p className="text-sm text-muted">Učitavanje…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <StatusBadge status={contact.status} />
            <dl className="mt-4 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words whitespace-pre-line">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Istorija događaja</h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted">Još nema događaja.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{eventLabel(e.type)}</span>
                      <span className="text-xs text-muted">{formatDateTime(e.created_at)}</span>
                    </div>
                    {e.detail && <p className="mt-1 break-words text-muted">{e.detail}</p>}
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
            <p className="mt-2 text-xs text-muted">Za zahteve za brisanje podataka (GDPR).</p>
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
