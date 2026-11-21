import { useRef } from "react";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { clamp01, useScrollProgress } from "../motion/frame";
import { SplitRise } from "../motion/split";

/**
 * How it works, as a flight through four cards. The section pins the screen; scrolling carries
 * the cards out of the distance toward you, each one settling in the centre before passing the
 * camera. Phones and reduced motion get the same cards as a simple stack.
 */

const STEPS = [
  {
    title: "Paste the link",
    body: "A YouTube VOD, a Vimeo video or a direct .mp4 or .webm. Captions are pulled automatically; a transcript works too.",
    visual: "link",
  },
  {
    title: "AI ranks the moments",
    body: "Every candidate gets a 0 to 100 score for hook, clarity, payoff and quotability, plus a plain-English reason.",
    visual: "score",
  },
  {
    title: "Tighten the cut",
    body: "Nudge in and out points on a frame-accurate timeline, rewrite the hook, and export vertical 9:16.",
    visual: "trim",
  },
  {
    title: "Post or schedule",
    body: "YouTube Shorts, Instagram Reels and Facebook from one queue, now or in the next 15-minute slot.",
    visual: "post",
  },
] as const;

function Visual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "link")
    return (
      <div className="space-y-3">
        <p className="hud text-muted">Video link</p>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2 pl-4">
          <span className="min-w-0 flex-1 truncate text-[15px] text-muted">youtube.com/watch?v=launch-day-vod</span>
          <span className="shrink-0 rounded-lg bg-signal px-4 py-2.5 text-[15px] text-on-signal">Find my clips</span>
        </div>
        <p className="hud text-faint">Captions found · 6:12:44 of video</p>
      </div>
    );
  if (kind === "score")
    return (
      <ul className="space-y-4">
        {[
          ["One shot, zero hesitation", 94],
          ["Clutch escape", 88],
          ["Chat called it", 81],
        ].map(([t, s]) => (
          <li key={t}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[16px]">{t}</span>
              <span className="hud text-text">{s}</span>
            </div>
            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-signal" style={{ width: `${s}%` }} />
            </span>
          </li>
        ))}
      </ul>
    );
  if (kind === "trim")
    return (
      <div>
        <div className="relative h-20 overflow-hidden rounded-xl bg-surface-3">
          <div className="absolute inset-0 flex items-center gap-[3px] px-2" aria-hidden="true">
            {Array.from({ length: 48 }, (_, k) => (
              <span key={k} className="flex-1 rounded-full bg-line-strong" style={{ height: `${30 + Math.abs(Math.sin(k * 0.7) * 50)}%` }} />
            ))}
          </div>
          <div className="absolute inset-y-1.5 left-[30%] w-[38%] rounded-lg bg-signal/20 ring-2 ring-signal" />
        </div>
        <div className="hud mt-3 flex justify-between text-muted">
          <span>In 3:41:07.2</span>
          <span>Out 3:41:48.0</span>
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {(["youtube", "instagram", "facebook"] as const).map((p) => (
          <PlatformIcon key={p} platform={p} size={48} />
        ))}
      </div>
      <p className="hud text-muted">Scheduled · Today 7:45 PM</p>
    </div>
  );
}

function StepCard({ i, step }: { i: number; step: (typeof STEPS)[number] }) {
  return (
    <article className="grid gap-8 rounded-[32px] border border-line bg-surface p-7 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.4)] sm:p-10 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-10 lg:gap-14 lg:p-14">
      <div className="flex h-full flex-col justify-between gap-10">
        <p className="hud text-muted">
          <span className="text-signal">{String(i + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")}
          <span className="ml-3">Step</span>
        </p>
        <div>
          <h3 className="text-[clamp(31px,3.24vw,50px)] leading-[1.02] tracking-[-0.03em]">
            {step.title}
            
          </h3>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted">{step.body}</p>
        </div>
      </div>
      <div className="min-w-0 rounded-2xl border border-line bg-bg p-5 sm:p-7">
        <Visual kind={step.visual} />
      </div>
    </article>
  );
}

export function Flythrough() {
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  const ref = useScrollProgress<HTMLElement>((p) => {
    if (window.matchMedia("(max-width: 767px), (prefers-reduced-motion: reduce)").matches) return;
    const n = STEPS.length;
    // Each card has a focus point along the scroll; t is its distance from it in card spacings.
    // t < 0: still in the distance (smaller, off to one side); t = 0: centred; t > 0: passing the camera.
    let active = 0;
    cards.current.forEach((el, i) => {
      if (!el) return;
      const focus = 0.06 + (i / (n - 1)) * 0.82;
      const t = ((p - focus) * (n - 1)) / 0.82;
      // Coming in from the distance the card is drawn smaller (always sharp); leaving, it lifts
      // and fades rather than growing past the camera, so it never gets scaled up and blurry.
      const z = t < 0 ? t * 1300 : 0;
      const lift = t > 0 ? t * -14 : clamp01(-t) * 4;
      const side = i % 2 ? 1 : -1;
      const x = side * clamp01(-t) * 16;
      const opacity = clamp01((t + 1.4) / 0.8) * clamp01((0.5 - t) / 0.35);
      const settled = Math.abs(t) < 0.03;
      el.style.transform = settled
        ? "none"
        : `translate3d(${x.toFixed(2)}vw, ${lift.toFixed(2)}vh, ${z.toFixed(1)}px) rotateY(${(-x * 1.1).toFixed(2)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.visibility = opacity < 0.01 ? "hidden" : "visible";
      if (t > -0.5) active = i;
    });
    if (counter.current) counter.current.textContent = String(active + 1).padStart(2, "0");
    if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`;
  });

  return (
    <section id="how" ref={ref} className="relative scroll-mt-0 md:h-[460vh]">
      <div className="md:sticky md:top-0 md:flex md:h-[100svh] md:flex-col md:overflow-hidden">
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-24 sm:px-8 md:pt-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="hud text-muted">
                <span className="text-signal">/</span> How it works
              </p>
              <SplitRise as="h2" className="display mt-4 text-[clamp(40px,5.4vw,83px)]" parts={["Link in, Shorts out"]} />
            </div>
            <div className="hud hidden w-56 text-muted md:block">
              <div className="flex justify-between">
                <span>
                  Step <span ref={counter} className="text-text">01</span> / 04
                </span>
                <span>Scroll</span>
              </div>
              <span className="mt-3 block h-px w-full bg-line">
                <span ref={bar} className="block h-px origin-left scale-x-0 bg-signal" />
              </span>
            </div>
          </div>
        </div>

        {/* Desktop: the 3D flight */}
        <div className="fly-stage relative hidden min-h-0 flex-1 place-items-center pb-6 md:grid" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className="fly-card w-[min(1040px,88vw)] [grid-area:1/1]"
              style={{ opacity: 0 }}
            >
              <StepCard i={i} step={s} />
            </div>
          ))}
        </div>

        {/* Phones, reduced motion and screen readers: the same steps as a list */}
        <ol className="fly-list mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 pt-10 pb-24 sm:px-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="min-w-0">
              <StepCard i={i} step={s} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
