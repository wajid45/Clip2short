import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";

/**
 * Scroll story: steps on the left, a sticky 3D "app window" on the right that flips to the
 * matching product state as each step reaches the middle of the screen.
 */

const STEPS = [
  {
    k: "paste",
    n: "01",
    title: "Paste the stream",
    body: "Drop a YouTube VOD, Vimeo link or .mp4. Title, length and description are read for you, and captions are pulled from every source available.",
    path: "shortlark.app/videos",
  },
  {
    k: "score",
    n: "02",
    title: "AI reads every word",
    body: "The whole transcript is scored for hook, stand-alone clarity, payoff and quotability. You get a ranked list, and each pick says why it was chosen.",
    path: "shortlark.app/moments",
  },
  {
    k: "edit",
    n: "03",
    title: "Nudge the cut",
    body: "Play the moment, set in and out at the playhead, and snap to caption lines. AI writes the hook, caption and post text; you approve it.",
    path: "shortlark.app/clips/clutch-escape",
  },
  {
    k: "post",
    n: "04",
    title: "Publish everywhere",
    body: "Upload the Short to YouTube, post to Instagram Reels and Facebook, or download the MP4. Schedule a week of clips in one sitting.",
    path: "shortlark.app/queue",
  },
] as const;

function Check({ on = true }: { on?: boolean }) {
  return (
    <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-full", on ? "bg-ready/15 text-ready" : "bg-signal-soft text-signal")}>
      {on ? (
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 10.5 4 4 8-9" />
        </svg>
      ) : (
        <span className="size-1.5 animate-pulse rounded-full bg-signal" />
      )}
    </span>
  );
}

function PastePanel() {
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-bg p-1.5 pl-3">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-faint" aria-hidden="true">
          <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
        </svg>
        <span className="tc min-w-0 flex-1 truncate text-sm text-text">
          youtube.com/watch?v=launch-day-marathon
          <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-signal" />
        </span>
        <span className="rounded-lg bg-signal px-3 py-1.5 text-xs font-medium text-white">Find moments</span>
      </div>

      <div className="flex gap-4 rounded-xl border border-line p-3">
        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-[#2a0f3d] via-[#c2275a] to-[#ff9a3c]">
          <span className="tc absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white">6:12:00</span>
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-medium text-text">Launch-day marathon stream</p>
          <p className="mt-0.5 text-xs text-muted">YouTube · NightShift Gaming</p>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-faint">Six hours of launch-day chaos: heists, chases and a few rage quits.</p>
        </div>
      </div>

      <ul className="space-y-3 rounded-xl bg-surface-2/70 p-4 text-sm">
        <li className="flex items-center gap-3">
          <Check /> <span className="flex-1 text-text">Title, length and description</span> <span className="text-xs text-faint">read from link</span>
        </li>
        <li className="flex items-center gap-3">
          <Check /> <span className="flex-1 text-text">Captions</span> <span className="text-xs text-ready">creator track · exact</span>
        </li>
        <li className="flex items-center gap-3">
          <Check on={false} /> <span className="flex-1 text-text">AI scanning 6h 12m</span> <span className="tc text-xs text-signal">62%</span>
        </li>
        <li className="pl-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-[62%] origin-left animate-[grow_2.5s_ease-out_both] rounded-full bg-signal" />
          </div>
        </li>
      </ul>
      <p className="text-center text-xs text-faint">Uses 372 credits · about a minute for a 6-hour stream</p>
    </div>
  );
}

function ScorePanel() {
  const rows = [
    { s: 94, t: "One shot, zero hesitation", tc: "3:41:07", c: "Main event", w: [97, 88, 91, 90] },
    { s: 88, t: "Clutch escape on the bridge", tc: "2:02:51", c: "Main event", w: [90, 86, 84, 80] },
    { s: 83, t: "The rage quit that wasn't", tc: "4:37:12", c: "Funny", w: [85, 79, 82, 77] },
  ];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          <span className="tc font-semibold text-text">12</span> moments · best first
        </span>
        <span className="rounded-md border border-line px-2 py-0.5 text-muted">Focus: Main events</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.t} className={clsx("rounded-xl border p-3", i === 0 ? "border-signal/60 bg-signal-soft" : "border-line")}>
            <div className="flex items-center gap-3">
              <span
                className={clsx(
                  "tc flex h-9 min-w-11 items-center justify-center rounded-md border text-sm font-semibold",
                  r.s >= 85 ? "border-ready/40 bg-ready/10 text-ready" : "border-line-strong text-text",
                )}
              >
                {r.s}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{r.t}</p>
                <p className="tc text-[11px] text-signal">
                  {r.tc} <span className="font-sans text-faint">· {r.c}</span>
                </p>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {["Hook", "Alone", "Payoff", "Quote"].map((l, j) => (
                <div key={l}>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full origin-left animate-[grow_1.2s_ease-out_both] rounded-full bg-signal" style={{ width: `${r.w[j]}%`, animationDelay: `${i * 150 + j * 80}ms` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-faint">{l}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="rounded-lg bg-surface-2/70 px-3 py-2 text-xs leading-relaxed text-muted">
        <span className="font-medium text-text">Why #1: </span>opens on the shot itself and pays off with chat&apos;s reaction inside 40 seconds.
      </p>
    </div>
  );
}

function EditPanel() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="relative h-40 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#05121f] via-[#0b3a5c] to-[#19c3c9]">
        <div className="absolute inset-x-[10%] bottom-[16%] text-center text-sm font-extrabold tracking-tight text-white uppercase [text-shadow:0_2px_8px_rgba(0,0,0,.6)]">
          one shot. <span className="text-[#ffd84d]">zero</span> hesitation
        </div>
        <div className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/40 text-xs text-white">▶</div>
        <span className="tc absolute top-3 right-3 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">3:41:21.4</span>
      </div>
      <div className="relative h-12 rounded-lg bg-surface-2">
        {[8, 14, 22, 30, 41, 47, 55, 63, 70, 78, 86].map((x, i) => (
          <span key={i} className="absolute top-2 h-2 rounded-sm bg-line-strong" style={{ left: `${x}%`, width: "5%" }} />
        ))}
        <div className="absolute top-5 bottom-2 animate-[nudge_4s_ease-in-out_infinite] rounded-sm bg-signal/25 ring-1 ring-signal" style={{ left: "28%", width: "40%" }} />
        <div className="absolute -inset-y-1 left-[46%] w-px animate-[scrub_4s_linear_infinite] bg-text" />
      </div>
      <div className="tc flex justify-between text-xs">
        <span className="rounded bg-signal px-1.5 py-0.5 text-white">IN 3:41:07.2</span>
        <span className="text-muted">0:41</span>
        <span className="rounded bg-signal px-1.5 py-0.5 text-white">OUT 3:41:48.0</span>
      </div>
      <div className="mt-auto space-y-2 rounded-xl border border-line p-3">
        <p className="text-[11px] text-faint">Written by AI · approved</p>
        <p className="text-sm text-text">&ldquo;He didn&apos;t even look. One shot.&rdquo;</p>
        <div className="flex flex-wrap gap-1.5">
          {["Hook", "Caption", "YouTube title", "Reels caption"].map((x) => (
            <span key={x} className="inline-flex items-center gap-1 rounded-md bg-ready/10 px-2 py-0.5 text-[11px] text-ready">
              ✓ {x}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostPanel() {
  const rows = [
    ["youtube", "Uploaded as a Short", "Live"],
    ["instagram", "Thu 18:00", "Scheduled"],
    ["facebook", "Thu 18:15", "Scheduled"],
  ] as const;
  const days = [
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 0],
    ["Thu", 3],
    ["Fri", 2],
    ["Sat", 1],
    ["Sun", 0],
  ] as const;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-2">
        {rows.map(([p, t, s], i) => (
          <div key={p} className="flex animate-[rise_.6s_ease-out_both] items-center gap-3 rounded-xl border border-line p-2.5" style={{ animationDelay: `${i * 120}ms` }}>
            <PlatformIcon platform={p} size={28} className="ring-0" />
            <p className="min-w-0 flex-1 truncate text-sm text-text">{t}</p>
            <span className={clsx("rounded-md px-2 py-0.5 text-xs font-medium", s === "Live" ? "bg-ready/10 text-ready" : "bg-draft/10 text-draft")}>{s}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-xl bg-surface-2/70 p-3">
        <p className="mb-2 text-xs text-muted">This week</p>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {days.map(([d, n]) => (
            <div key={d} className={clsx("rounded-lg py-2", d === "Thu" ? "bg-signal-soft ring-1 ring-signal" : "bg-surface")}>
              <p className="text-[10px] text-faint">{d}</p>
              <p className={clsx("tc mt-0.5 text-sm font-semibold", n ? "text-text" : "text-faint")}>{n}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs text-muted">
        <span>Prefer to post yourself?</span>
        <span className="font-medium text-text">Download MP4 · 9:16</span>
      </p>
    </div>
  );
}

const PANELS = { paste: PastePanel, score: ScorePanel, edit: EditPanel, post: PostPanel };

/** App-window frame around a panel: traffic lights, path, and the step progress. */
function Frame({ path, active, children }: { path: string; active: number; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_40px_120px_-60px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="tc min-w-0 flex-1 truncate rounded-md bg-bg px-2 py-0.5 text-center text-[11px] text-faint">{path}</span>
        <span className="flex gap-1">
          {STEPS.map((_, j) => (
            <span key={j} className={clsx("h-1 w-4 rounded-full transition-colors", j === active ? "bg-signal" : "bg-surface-3")} />
          ))}
        </span>
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
}

export function StoryScroll() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div className="min-w-0">
        {STEPS.map((s, i) => {
          const P = PANELS[s.k];
          return (
            <div
              key={s.k}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-i={i}
              className="flex min-h-[46vh] flex-col justify-center py-8 lg:min-h-[64vh]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={clsx(
                    "tc flex size-9 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
                    active === i ? "bg-signal text-white" : "bg-surface-2 text-faint",
                  )}
                >
                  {s.n}
                </span>
                <span className={clsx("h-px flex-1 transition-colors", active === i ? "bg-signal/40" : "bg-line")} />
              </div>
              <h3 className={clsx("mt-5 text-3xl font-semibold tracking-[-0.03em] transition-colors sm:text-4xl", active === i ? "text-text" : "text-faint")}>
                {s.title}
              </h3>
              <p className={clsx("mt-4 max-w-md text-[16px] leading-relaxed transition-colors", active === i ? "text-muted" : "text-faint/70")}>{s.body}</p>
              {/* On small screens the window sits under each step instead of sticking. */}
              <div className="mt-6 h-[460px] lg:hidden">
                <Frame path={s.path} active={i}>
                  <P />
                </Frame>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden lg:block">
        <div className="stage-3d sticky top-[14vh] h-[500px]">
          {STEPS.map((s, i) => {
            const P = PANELS[s.k];
            const state = i === active ? "on" : i < active ? "past" : "next";
            return (
              <div
                key={s.k}
                aria-hidden={i !== active}
                className="absolute inset-0 transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
                style={{
                  transform:
                    state === "on" ? "none" : state === "past" ? "translateY(-40px) rotateX(18deg) translateZ(-160px)" : "translateY(60px) rotateX(-18deg) translateZ(-160px)",
                  opacity: state === "on" ? 1 : 0,
                  pointerEvents: state === "on" ? "auto" : "none",
                }}
              >
                <Frame path={s.path} active={active}>
                  {i === active || Math.abs(i - active) === 1 ? <P /> : null}
                </Frame>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
