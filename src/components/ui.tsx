"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STATUS_LABELS, type ContactStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const STATUS_COLORS: Record<ContactStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  in_sequence: "bg-sky-50 text-sky-800",
  replied: "bg-amber-50 text-amber-800",
  interested: "bg-emerald-50 text-emerald-800",
  not_interested: "bg-stone-100 text-stone-700",
  unsubscribed: "bg-stone-100 text-stone-700",
  bounced: "bg-red-50 text-red-700",
  finished_no_reply: "bg-slate-100 text-slate-600",
  paused: "bg-orange-50 text-orange-800",
};

export function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-lg flex-col bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <Button onClick={onClose} aria-label="Zatvori">
            Zatvori
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
  const cls =
    kind === "error"
      ? "bg-danger-soft text-danger"
      : kind === "success"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-accent-soft text-accent";
  return <div className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
