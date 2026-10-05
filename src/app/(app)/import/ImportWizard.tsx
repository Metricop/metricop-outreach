"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { chunk, fetchAll } from "@/lib/fetchAll";
import { parseContactsFile, type ParsedFile } from "@/lib/parseFile";
import { createClient } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import {
  IMPORT_FIELDS,
  SKIP_REASON_LABELS,
  checkImportRows,
  guessMapping,
  type ImportCheck,
  type ImportField,
  type ImportRow,
  type SkippedRow,
} from "@logic/importRows.ts";
import { normalizeEmail } from "@logic/email.ts";

const FIELD_LABELS: Record<ImportField, string> = {
  company: "Firma",
  first_name: "Ime",
  email: "Email",
  city: "Grad",
  personalization: "Personalizacija",
  source: "Izvor",
};

type Phase = "upload" | "map" | "preview" | "done";

interface Report {
  imported: number;
  skipped: SkippedRow[];
}

export function ImportWizard() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("groups")
      .select("*")
      .order("priority")
      .order("code")
      .then(({ data }) => setGroups(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const p = await parseContactsFile(file);
      setParsed(p);
      setFileName(file.name);
      setMapping(guessMapping(p.headers));
      setPhase("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fajl ne može da se pročita.");
    } finally {
      setBusy(false);
    }
  }

  const mappedRows: ImportRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((r) => {
      const row: ImportRow = {};
      for (const f of IMPORT_FIELDS) if (mapping[f] !== undefined) row[f] = r[mapping[f]!];
      return row;
    });
  }, [parsed, mapping]);

  async function runCheck() {
    setError(null);
    if (mapping.email === undefined) return setError("Izaberite kolonu sa email adresom.");
    if (!groupId) return setError("Izaberite grupu u koju se uvoze kontakti.");
    setBusy(true);
    try {
      const suppressionRows = await fetchAll<{ email: string | null; domain: string | null }>((from, to) =>
        supabase.from("suppression").select("email, domain").range(from, to),
      );
      const suppression = {
        emails: new Set(suppressionRows.flatMap((s) => (s.email ? [s.email] : []))),
        domains: new Set(suppressionRows.flatMap((s) => (s.domain ? [s.domain] : []))),
      };
      const fileEmails = [...new Set(mappedRows.map((r) => normalizeEmail(r.email ?? "")).filter(Boolean))];
      const existing = new Set<string>();
      for (const part of chunk(fileEmails, 150)) {
        const { data, error } = await supabase.from("contacts").select("email").in("email", part);
        if (error) throw new Error(error.message);
        data?.forEach((d) => existing.add(d.email));
      }
      setCheck(checkImportRows(mappedRows, existing, suppression));
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provera nije uspela.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!check) return;
    setError(null);
    setBusy(true);
    try {
      const skipped = [...check.skipped];
      let imported = 0;
      for (const part of chunk(check.valid, 500)) {
        const { data, error } = await supabase
          .from("contacts")
          .upsert(
            part.map((r) => ({
              email: r.email,
              company: r.company,
              first_name: r.first_name,
              city: r.city,
              personalization: r.personalization,
              source: r.source,
              group_id: groupId,
              status: "new",
            })),
            { onConflict: "email", ignoreDuplicates: true },
          )
          .select("email");
        if (error) throw new Error(error.message);
        const inserted = new Set((data ?? []).map((d) => d.email));
        imported += inserted.size;
        part
          .filter((r) => !inserted.has(r.email))
          .forEach((r) => skipped.push({ rowNumber: r.rowNumber, email: r.email, reason: "duplicate_in_db" }));
      }
      skipped.sort((a, b) => a.rowNumber - b.rowNumber);
      setReport({ imported, skipped });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uvoz nije uspeo.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhase("upload");
    setParsed(null);
    setCheck(null);
    setReport(null);
    setMapping({});
    setFileName("");
    setError(null);
  }

  const groupName = groups.find((g) => g.id === groupId);

  return (
    <div className="max-w-4xl space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {(["upload", "map", "preview", "done"] as Phase[]).map((p, i) => (
          <li
            key={p}
            className={`rounded-full px-3 py-1 ${phase === p ? "bg-accent text-white" : "bg-surface text-muted border border-border"}`}
          >
            {i + 1}. {{ upload: "Fajl", map: "Kolone i grupa", preview: "Pregled", done: "Izveštaj" }[p]}
          </li>
        ))}
      </ol>

      {error && <Notice kind="error">{error}</Notice>}

      {phase === "upload" && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Izaberite CSV ili XLSX fajl. Prvi red mora biti zaglavlje sa nazivima kolona.</p>
          <label className="mt-4 inline-block cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            {busy ? "Čitanje…" : "Izaberi fajl"}
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {phase === "map" && parsed && (
        <div className="space-y-5 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span> · {parsed.rows.length} redova
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <Field key={f} label={FIELD_LABELS[f] + (f === "email" ? " *" : "")}>
                <select
                  className={inputClass}
                  value={mapping[f] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                >
                  <option value="">— ne uvozi —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                      {parsed.rows[0]?.[i] ? ` (npr. ${parsed.rows[0][i].slice(0, 30)})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Field label="Grupa *">
            <select className={inputClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— izaberite grupu —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </select>
          </Field>
          {groups.length === 0 && (
            <Notice>
              Nema nijedne grupe. Prvo napravite grupu na ekranu{" "}
              <Link href="/grupe" className="underline">
                Grupe i šabloni
              </Link>
              .
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={runCheck} disabled={busy}>
              {busy ? "Provera…" : "Proveri redove"}
            </Button>
            <Button onClick={reset} disabled={busy}>
              Drugi fajl
            </Button>
          </div>
        </div>
      )}

      {phase === "preview" && check && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Redova u fajlu" value={mappedRows.length} />
            <Stat label="Biće uvezeno" value={check.valid.length} accent />
            <Stat label="Biće preskočeno" value={check.skipped.length} />
          </div>
          <p className="text-sm text-muted">
            Grupa: <span className="font-medium text-foreground">{groupName?.code}</span>. Uvoze se samo ispravni redovi.
          </p>
          {check.skipped.length > 0 && <SkippedTable rows={check.skipped} title="Upozorenja (ovi redovi se preskaču)" />}
          {check.valid.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <p className="border-b border-border px-4 py-3 text-sm font-medium">
                Prvih {Math.min(10, check.valid.length)} od {check.valid.length} redova za uvoz
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Firma</th>
                    <th className="px-4 py-2 font-medium">Ime</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Grad</th>
                  </tr>
                </thead>
                <tbody>
                  {check.valid.slice(0, 10).map((r) => (
                    <tr key={r.rowNumber} className="border-t border-border">
                      <td className="px-4 py-2">{r.company ?? "—"}</td>
                      <td className="px-4 py-2">{r.first_name ?? "—"}</td>
                      <td className="px-4 py-2 break-all">{r.email}</td>
                      <td className="hidden px-4 py-2 sm:table-cell">{r.city ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={runImport} disabled={busy || check.valid.length === 0}>
              {busy ? "Uvoz…" : `Uvezi ${check.valid.length} kontakata`}
            </Button>
            <Button onClick={() => setPhase("map")} disabled={busy}>
              Nazad
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && report && (
        <div className="space-y-5">
          <Notice kind="success">
            Uvezeno {report.imported} kontakata u grupu {groupName?.code}. Preskočeno: {report.skipped.length}.
          </Notice>
          {report.skipped.length > 0 && <SkippedTable rows={report.skipped} title="Preskočeni redovi" />}
          <div className="flex flex-wrap gap-2">
            <Link href="/kontakti" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
              Otvori Kontakte
            </Link>
            <Button onClick={reset}>Nov uvoz</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function SkippedTable({ rows, title }: { rows: SkippedRow[]; title: string }) {
  const byReason = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted">
          {Object.entries(byReason)
            .map(([reason, n]) => `${SKIP_REASON_LABELS[reason as keyof typeof SKIP_REASON_LABELS]}: ${n}`)
            .join(" · ")}
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Red</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Razlog</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rowNumber}-${r.reason}`} className="border-t border-border">
              <td className="px-4 py-2">{r.rowNumber}</td>
              <td className="px-4 py-2 break-all">{r.email || "(prazno)"}</td>
              <td className="px-4 py-2">{SKIP_REASON_LABELS[r.reason]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
