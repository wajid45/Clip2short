import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "@shortlark/shared/categories";
import { SplitRise } from "../motion/split";
import { prefersReducedMotion } from "../motion/frame";
import { DEMO, type DemoMoment } from "../content/site";

/** Two example moments per engine for the console (illustrative). */
const EXAMPLES: Record<CategoryId, DemoMoment[]> = {
  podcast: DEMO.podcast.moments.slice(0, 2),
  gaming: DEMO.gaming.moments.slice(0, 2),
  sports: DEMO.sports.moments.slice(0, 2),
  movies: [
    { start: "0:12:40", end: "0:13:22", label: "Verdict", title: "Why the ending works on a second watch", score: 90, reason: "A clear verdict with one concrete reason; no spoilers in the first seconds." },
    { start: "0:31:05", end: "0:31:44", label: "Hot take", title: "The sequel that beat the original", score: 85, reason: "A contrarian claim that invites comments." },
  ],
  other: [
    { start: "0:22:10", end: "0:22:58", label: "How-to", title: "The three-step setup most people skip", score: 89, reason: "Concrete steps that stand on their own." },
    { start: "0:47:31", end: "0:48:05", label: "Funny moment", title: "When the demo went sideways", score: 84, reason: "A laugh that lands in the first five seconds." },
  ],
};

const MAX_SECONDS = 90;

/**
 * Home section: the five category engines as a console. Rows on the left select an engine; the
 * dark panel on the right shows its brief, clip length, moment labels and an example shortlist.
 * It cycles on its own until the visitor hovers or picks one.
 */
export function Engines() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const c = CATEGORIES[active];

  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const el = root.current;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (el) io.observe(el);
    const id = setInterval(() => visible && setActive((a) => (a + 1) % CATEGORIES.length), 4200);
    return () => {
      clearInterval(id);
      io.disconnect();
    };
  }, [paused]);

  return (
    <section ref={root} className="relative border-t border-line">
      <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 sm:py-28">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="hud text-muted">
              <span className="text-signal">/</span> Category engines
            </p>
            <SplitRise as="h2" className="display mt-4 text-[clamp(40px,5.4vw,84px)]" parts={["One engine for\neach kind of video"]} />
          </div>
          <p className="max-w-md text-[18px] leading-relaxed text-muted lg:justify-self-end">
            A goal is not a punchline. Pick the category when you paste a link and Shortlark runs an engine tuned for it: its own model, its own idea of a highlight, and the right clip length.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-[0.9fr_1.3fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {/* Selector */}
          <div role="tablist" aria-label="Category engines" className="flex flex-col border-t border-line">
            {CATEGORIES.map((cat, i) => {
              const on = i === active;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="engine-panel"
                  onClick={() => {
                    setActive(i);
                    setPaused(true);
                  }}
                  className={clsx("group relative flex items-center gap-5 border-b border-line py-5 text-left transition-colors", on ? "text-text" : "text-muted hover:text-text")}
                >
                  <span className={clsx("hud w-7 shrink-0", on ? "text-signal" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1">
                    <span className={clsx("block text-[clamp(28px,3vw,44px)] leading-none tracking-[-0.03em] transition-transform duration-300", on && "translate-x-2")}>{cat.label}</span>
                    <span className="hud mt-2 block text-faint">{cat.engine}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                      on ? "border-signal bg-signal text-on-signal" : "border-line text-muted group-hover:border-line-strong",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </span>
                  {on && !paused && <span className="engine-progress absolute bottom-[-1px] left-0 h-[2px] bg-signal" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* Console */}
          <div id="engine-panel" role="tabpanel" className="relative overflow-hidden rounded-[32px] bg-[#0b0c10] p-6 text-white sm:p-9">
            <div className="plan-glow pointer-events-none absolute inset-x-0 -top-24 h-72" aria-hidden="true" />
            <div key={c.id} className="engine-swap relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-md border border-signal/50 bg-signal/15 px-2.5 py-1 text-[13px] text-[#ff9a5c]">{c.engine}</span>
                <a href={`/engines/${c.slug}`} className="hud text-white/60 hover:text-white">
                  About this engine →
                </a>
              </div>

              <p className="mt-7 max-w-xl text-[clamp(22px,2.2vw,30px)] leading-snug tracking-[-0.01em]">{c.looksFor}</p>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="hud text-white/50">Clip length</p>
                  <p className="mt-2 text-[26px] tracking-[-0.02em]">
                    {c.clipSeconds[0]} to {c.clipSeconds[1]} <span className="hud text-white/50">sec</span>
                  </p>
                  <span className="relative mt-3 block h-1.5 rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 rounded-full bg-sunset"
                      style={{ left: `${(c.clipSeconds[0] / MAX_SECONDS) * 100}%`, width: `${((c.clipSeconds[1] - c.clipSeconds[0]) / MAX_SECONDS) * 100}%` }}
                    />
                  </span>
                </div>
                <div>
                  <p className="hud text-white/50">Moment labels</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.labels.slice(0, 5).map((l) => (
                      <span key={l} className="rounded-full border border-white/15 px-2.5 py-1 text-[13px] text-white/85">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="hud mt-9 text-white/50">Example shortlist</p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {EXAMPLES[c.id].map((m) => (
                  <li key={m.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="hud text-white/55">{m.label}</p>
                    <p className="mt-3 text-[17px] leading-snug">{m.title}</p>
                    <p className="tc mt-2 text-[13px] text-white/50">Score {m.score}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
