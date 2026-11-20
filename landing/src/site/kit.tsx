import clsx from "clsx";
import type { ReactNode } from "react";
import { ShortsWall } from "@/components/landing/shorts-wall";
import { SplitRise } from "../motion/split";
import { appHref } from "../config";

/**
 * Building blocks for the inner pages, in the same style as the home page: mono eyebrow with an
 * orange slash, big serif headline that rises in, muted body copy, hairline rules.
 */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx("hud text-muted", className)}>
      <span className="text-signal">/</span> {children}
    </p>
  );
}

export function SectionHead({ eyebrow, title, intro, center }: { eyebrow: string; title: string; intro?: ReactNode; center?: boolean }) {
  return (
    <div className={clsx("grid gap-8", center ? "text-center" : "lg:grid-cols-[1.1fr_1fr] lg:items-end")}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <SplitRise as="h2" className="display mt-4 text-[clamp(38px,5vw,76px)]" parts={[title]} />
      </div>
      {intro && <div className={clsx("max-w-xl text-[18px] leading-relaxed text-muted", center ? "mx-auto" : "lg:justify-self-end")}>{intro}</div>}
    </div>
  );
}

export function Section({ children, className, id, border = true }: { children: ReactNode; className?: string; id?: string; border?: boolean }) {
  return (
    <section id={id} className={clsx("relative scroll-mt-0", border && "border-t border-line", className)}>
      <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-8 sm:py-28">{children}</div>
    </section>
  );
}

/** Numbered cards in a grid (features, steps, principles). */
export function CardGrid({ items, cols = 3 }: { items: { title: string; body: ReactNode; tag?: string; extra?: ReactNode }[]; cols?: 2 | 3 | 4 }) {
  return (
    <ul className={clsx("mt-14 grid gap-3 sm:grid-cols-2", cols === 3 && "lg:grid-cols-3", cols === 4 && "lg:grid-cols-4")}>
      {items.map((it, i) => (
        <li key={it.title} className="flex flex-col rounded-[24px] border border-line bg-surface p-7 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-signal/50">
          <p className="hud text-faint">
            <span className="text-signal">{String(i + 1).padStart(2, "0")}</span>
            {it.tag ? ` / ${it.tag}` : ""}
          </p>
          <h3 className="mt-6 text-[26px] leading-[1.08] tracking-[-0.02em]">{it.title}</h3>
          <div className="mt-3 flex-1 text-[16px] leading-relaxed text-muted">{it.body}</div>
          {it.extra && <div className="mt-6">{it.extra}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Steps as a numbered list with a rule between each. */
export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="mt-14 border-t border-line">
      {steps.map((s, i) => (
        <li key={s.title} className="grid gap-3 border-b border-line py-8 lg:grid-cols-[80px_1fr_1.2fr] lg:items-baseline lg:gap-8">
          <span className="hud text-signal">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="text-[clamp(24px,2.4vw,34px)] leading-[1.08] tracking-[-0.02em]">{s.title}</h3>
          <p className="max-w-xl text-[16px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Tags({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((l) => (
        <span key={l} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-text">
          {l}
        </span>
      ))}
    </div>
  );
}

export interface QA {
  q: string;
  a: ReactNode;
}

/** Questions as an accordion: number, question, plus sign that turns into a minus. */
export function FaqList({ items, start = 0 }: { items: QA[]; start?: number }) {
  return (
    <div className="border-t border-line">
      {items.map((f, i) => (
        <details key={f.q} className="faq-item group border-b border-line">
          <summary className="flex cursor-pointer list-none items-baseline gap-5 py-6 [&::-webkit-details-marker]:hidden">
            <span className="hud w-7 shrink-0 text-faint">{String(start + i + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-[clamp(19px,1.8vw,24px)] leading-snug tracking-[-0.01em] transition-colors group-hover:text-signal">{f.q}</span>
            <span className="faq-plus relative size-4 shrink-0 self-center" aria-hidden="true" />
          </summary>
          <div className="max-w-2xl pb-7 pl-12 text-[16px] leading-relaxed text-muted">{f.a}</div>
        </details>
      ))}
    </div>
  );
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="ulink inline-flex">
      {children} <span aria-hidden="true">→</span>
    </a>
  );
}

/** The closing call to action over the wall of Shorts, shared by every page. */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-inverse text-inverse-text">
      <ShortsWall />
      <div className="relative mx-auto max-w-[1240px] px-4 py-28 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-4xl rounded-[36px] border border-inverse-text/10 bg-inverse/85 px-6 py-14 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-14">
          <h2 className="mx-auto max-w-3xl text-[40px] leading-[1.0] font-semibold tracking-[-0.05em] sm:text-[58px]">
            Your next stream has a dozen Shorts in it
            <br />
            <span className="text-sunset font-display font-normal tracking-normal italic">Let&apos;s find them</span>
          </h2>
          <a
            href={appHref("/signup")}
            className="group mt-10 inline-flex h-14 items-center gap-3 rounded-full bg-signal pr-2.5 pl-8 text-[18px] font-medium text-on-signal shadow-[0_18px_50px_-14px_rgba(217,72,15,0.75)] transition-[background-color,transform] hover:bg-signal-strong active:scale-[0.98]"
          >
            Start free
            <span className="flex size-9 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
