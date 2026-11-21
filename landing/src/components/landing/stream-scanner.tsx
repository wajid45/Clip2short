import { useEffect, useRef } from "react";

/**
 * "Live scan" of a 6-hour stream: a waveform the AI playhead sweeps across, with
 * moments lighting up (score chips pop) as it reaches them. One rAF loop writes a
 * CSS variable and a few text nodes; no React re-renders per frame.
 */

const TOTAL = 6 * 3600 + 12 * 60; // 6:12:00
const BARS = 180;
export const MOMENTS = [
  { t: 0.07, w: 0.012, score: 72, label: "Opening rant" },
  { t: 0.19, w: 0.014, score: 81, label: "Chat called it" },
  { t: 0.33, w: 0.01, score: 88, label: "Clutch escape" },
  { t: 0.47, w: 0.016, score: 76, label: "Hot take" },
  { t: 0.595, w: 0.012, score: 94, label: "One shot, zero hesitation" },
  { t: 0.74, w: 0.014, score: 83, label: "Rage quit" },
  { t: 0.88, w: 0.011, score: 79, label: "Thank-you speech" },
];
const SWEEP_MS = 11000;
const HOLD_MS = 1600;

// Deterministic "audio" so server and client render the same bars.
const heights = Array.from({ length: BARS }, (_, i) => {
  const x = i / BARS;
  const base = 0.35 + 0.25 * Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1.3) + 0.18 * Math.sin(i * 1.7);
  const spike = MOMENTS.some((m) => Math.abs(x - m.t - m.w / 2) < m.w) ? 0.35 : 0;
  return Math.round(Math.max(0.12, Math.min(1, Math.abs(base) + spike)) * 1000) / 1000;
});

function tc(sec: number) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Wave({ bright }: { bright?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center gap-px sm:gap-[2px]" aria-hidden="true">
      {heights.map((h, i) => (
        <span key={i} className={bright ? "flex-1 rounded-full bg-text/70" : "flex-1 rounded-full bg-line-strong"} style={{ height: `${h * 100}%` }} />
      ))}
    </div>
  );
}

export function StreamScanner() {
  const root = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const foundRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const chips = [...el.querySelectorAll<HTMLElement>("[data-moment]")];
    const set = (p: number) => {
      el.style.setProperty("--p", String(p));
      if (timeRef.current) timeRef.current.textContent = tc(p * TOTAL);
      let found = 0;
      let best = 0;
      chips.forEach((c, i) => {
        const on = p >= MOMENTS[i].t;
        if (on) {
          found++;
          best = Math.max(best, MOMENTS[i].score);
        }
        if ((c.dataset.on === "1") !== on) c.dataset.on = on ? "1" : "0";
      });
      if (foundRef.current) foundRef.current.textContent = String(found);
      if (bestRef.current) bestRef.current.textContent = best ? String(best) : "·";
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      set(1);
      return;
    }
    let raf = 0;
    let start = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    const loop = (now: number) => {
      if (visible) {
        const e = now - start;
        if (e > SWEEP_MS + HOLD_MS) start = now;
        set(Math.min(1, e / SWEEP_MS));
      } else start = now - Number(el.style.getPropertyValue("--p") || 0) * SWEEP_MS;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <div
      ref={root}
      className="relative rounded-3xl border border-line bg-surface p-5 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.5)] sm:p-7"
      style={{ ["--p" as string]: "0" }}
      role="img"
      aria-label="Clip2Short scanning a 6-hour stream and scoring the moments it finds"
    >
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-soft px-2.5 py-1 text-xs font-medium text-signal">
            <span className="size-1.5 rounded-full bg-signal" />
            AI scan
          </span>
          <div>
            <p className="text-sm font-medium text-text">Six hour stream</p>
            <p className="tc text-xs text-faint">
              <span ref={timeRef}>0:00:00</span> / {tc(TOTAL)}
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-[11px] text-faint">Moments found</p>
            <p className="tc text-2xl font-semibold text-text">
              <span ref={foundRef}>0</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-faint">Best score</p>
            <p className="tc text-2xl font-semibold text-ready">
              <span ref={bestRef}>·</span>
            </p>
          </div>
        </div>
      </div>

      {/* waveform + moments */}
      <div className="relative mt-16 h-28 sm:h-32">
        <Wave />
        <div className="absolute inset-0" style={{ clipPath: "inset(0 calc((1 - var(--p)) * 100%) 0 0)" }}>
          <Wave bright />
        </div>

        {MOMENTS.map((m, i) => (
          <div
            key={i}
            data-moment
            data-on="0"
            className="group absolute inset-y-0"
            style={{ left: `${m.t * 100}%`, width: `${m.w * 100}%` }}
          >
            <div className="absolute inset-y-[-6px] inset-x-0 rounded-md bg-signal/0 ring-0 ring-signal transition-all duration-300 group-data-[on='1']:bg-signal/25 group-data-[on='1']:ring-2" />
            <div
              className={
                "absolute bottom-[calc(100%+14px)] left-1/2 w-max -translate-x-1/2 translate-y-2 scale-75 rounded-lg border border-line bg-surface px-2 py-1 opacity-0 shadow-lg transition-all duration-300 group-data-[on='1']:translate-y-0 group-data-[on='1']:scale-100 group-data-[on='1']:opacity-100 " +
                (i % 2 ? "max-sm:hidden" : "")
              }
            >
              <span className={`tc mr-1.5 text-xs font-semibold ${m.score >= 85 ? "text-ready" : "text-text"}`}>{m.score}</span>
              <span className="text-[11px] text-muted">{m.label}</span>
            </div>
          </div>
        ))}

        {/* playhead */}
        <div className="pointer-events-none absolute -inset-y-3 w-0.5 rounded-full bg-signal" style={{ left: "calc(var(--p) * 100%)" }}>
          <div className="absolute -top-1.5 -left-[5px] size-3 rounded-full bg-signal" />
        </div>
      </div>

      {/* axis */}
      <div className="tc mt-4 flex justify-between text-[11px] text-faint">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{tc(f * TOTAL)}</span>
        ))}
      </div>
    </div>
  );
}
