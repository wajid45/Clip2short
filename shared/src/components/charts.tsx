import { useLayoutEffect, useRef, useState } from "react";

/**
 * Small SVG charts, no library. Each renders at its container's width and a fixed height, with
 * a hover tooltip and a caption saying what the axes mean.
 */

export interface Point {
  label: string;
  title: string;
  value: number;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(max: number) {
  if (max <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 4 >= max) ?? mag * 10;
  return step * 4;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

export function ColumnChart({ data, height = 200, xLabel, yLabel, color = "var(--color-signal)" }: { data: Point[]; height?: number; xLabel: string; yLabel: string; color?: string }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 8, t: 10, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = iw / Math.max(1, data.length);
  const bar = Math.min(26, band * 0.62);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const everyLabel = Math.ceil(data.length / Math.max(1, Math.floor(iw / 56)));
  const empty = data.every((d) => d.value === 0);

  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} role="img" aria-label={`${yLabel} by ${xLabel.toLowerCase()}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} />
              <text x={pad.l - 8} y={y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--color-faint)" fontFamily="var(--font-mono)">
                {fmt(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * ih;
          const x = pad.l + i * band + (band - bar) / 2;
          return (
            <g key={d.title} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent" />
              <rect x={x} y={pad.t + ih - h} width={bar} height={Math.max(h, d.value ? 2 : 0)} rx={Math.min(4, bar / 2)} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % everyLabel === 0 && (
                <text x={pad.l + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--color-faint)" fontFamily="var(--font-mono)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {empty && <p className="absolute inset-0 flex items-center justify-center text-[13px] text-faint">Nothing in this window yet.</p>}
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)]"
          style={{ left: Math.min(w - 200, Math.max(0, pad.l + hover * band + band / 2 - 100)) }}
        >
          <p className="flex items-baseline justify-between gap-4 whitespace-nowrap">
            <span className="text-faint">{xLabel}</span>
            <span className="text-text">{data[hover].title}</span>
          </p>
          <p className="mt-0.5 flex items-baseline justify-between gap-4 whitespace-nowrap">
            <span className="text-faint">{yLabel}</span>
            <span className="num font-semibold text-text">{fmt(data[hover].value)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function LineChart({ data, height = 220, xLabel, yLabel, color = "var(--color-signal)" }: { data: Point[]; height?: number; xLabel: string; yLabel: string; color?: string }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const x = (i: number) => pad.l + (data.length < 2 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const everyLabel = Math.ceil(data.length / Math.max(1, Math.floor(iw / 64)));

  return (
    <div ref={ref} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`${yLabel} by ${xLabel.toLowerCase()}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--color-faint)" fontFamily="var(--font-mono)">
              {fmt(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) =>
          i % everyLabel === 0 ? (
            <text key={d.title} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--color-faint)" fontFamily="var(--font-mono)">
              {d.label}
            </text>
          ) : null,
        )}
        {hover !== null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-line-strong)" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={4.5} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)]" style={{ left: Math.min(w - 200, Math.max(0, x(hover) - 100)) }}>
          <p className="flex items-baseline justify-between gap-4 whitespace-nowrap">
            <span className="text-faint">{xLabel}</span>
            <span className="text-text">{data[hover].title}</span>
          </p>
          <p className="mt-0.5 flex items-baseline justify-between gap-4 whitespace-nowrap">
            <span className="text-faint">{yLabel}</span>
            <span className="num font-semibold text-text">{fmt(data[hover].value)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ points, width = 84, height = 26, color = "var(--color-signal)" }: { points: number[]; width?: number; height?: number; color?: string }) {
  const max = Math.max(1, ...points);
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * width).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** "2026-11" → "Nov", "2026-11-20" → "20 Nov". */
export const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
export const monthLong = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const dayShort = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const dayLong = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
