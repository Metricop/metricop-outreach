"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Pregled" },
  { href: "/kontakti", label: "Kontakti" },
  { href: "/import", label: "Import" },
  { href: "/grupe", label: "Grupe i šabloni" },
  { href: "/odgovori", label: "Odgovori" },
  { href: "/podesavanja", label: "Podešavanja" },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <span className="font-semibold">Metricop Outreach</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="glavni-meni"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          {open ? "Zatvori" : "Meni"}
        </button>
      </header>

      <aside
        id="glavni-meni"
        className={`${open ? "block" : "hidden"} border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0`}
      >
        <div className="hidden px-5 py-5 text-base font-semibold md:block">Metricop Outreach</div>
        <nav className="flex flex-col gap-0.5 px-3 py-2 md:flex-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2 text-sm ${
                isActive(item.href)
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-foreground hover:bg-background"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border px-5 py-4">
          <p className="truncate text-xs text-muted" title={email}>
            {email}
          </p>
          <form action="/auth/odjava" method="post" className="mt-2">
            <button type="submit" className="text-sm text-accent hover:underline">
              Odjavi se
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
