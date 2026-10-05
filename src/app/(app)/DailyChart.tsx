"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  sent: number;
  replies: number;
}

const SERIES = [
  { key: "sent" as const, label: "Poslato", color: "#2a78d6" },
  { key: "replies" as const, label: "Odgovori", color: "#eb6834" },
];

const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 32 };

const fmtDay = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(day)}.${Number(m)}.`;
};

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

export function DailyChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Širina crteža prati stvarnu širinu kartice, da tekst ostane čitljiv i na telefonu.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.sent, d.replies))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max].map((t) => Math.round(t));

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Slanje i odgovori, poslednjih 30 dana</p>
        <div className="flex gap-4 text-xs text-muted">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative" ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label="Grafikon poslatih mejlova i odgovora po danu za poslednjih 30 dana"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % 7 === (data.length - 1) % 7 ? (
              <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {fmtDay(d.day)}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {SERIES.map((s) => (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")}
              />
              {hover !== null && (
                <circle cx={x(hover)} cy={y(data[hover][s.key])} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              )}
            </g>
          ))}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > data.length / 2 ? "translateX(-105%)" : "translateX(5%)" }}
          >
            <p className="font-medium">{fmtDay(h.day)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 text-foreground">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: {h[s.key]}
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Prikaži kao tabelu</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-medium">Dan</th>
              <th className="py-1 font-medium">Poslato</th>
              <th className="py-1 font-medium">Odgovori</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day} className="border-t border-border text-foreground">
                <td className="py-1">{fmtDay(d.day)}</td>
                <td className="py-1">{d.sent}</td>
                <td className="py-1">{d.replies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
