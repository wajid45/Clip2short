import clsx from "clsx";
import type { ReactNode } from "react";
import { PlatformIcon } from "../platform-icon";
import { Reveal, TiltCard } from "./reveal";

/** Feature bento: every tile carries a small live piece of the real product, not an icon. */

function Tile({ title, body, children, className, delay = 0 }: { title: string; body: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={className}>
      <TiltCard className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative min-h-44 flex-1 border-b border-line bg-surface-2/50 p-5">{children}</div>
        <div className="p-6">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
        </div>
      </TiltCard>
    </Reveal>
  );
}

const ORBIT = ["youtube", "instagram", "facebook"];

export function Bento() {
  return (
    <div className="grid gap-5 md:grid-cols-6">
      <Tile
        className="md:col-span-4"
        title="A score you can argue with"
        body="Every moment gets a 0–100 virality score broken into hook, stand-alone clarity, payoff and quotability, plus a plain-English reason."
      >
        <div className="flex h-full items-center gap-8">
          <div className="text-center">
            <p className="tc text-6xl font-semibold tracking-tight text-ready">94</p>
            <p className="mt-1 text-xs text-muted">Virality score</p>
          </div>
          <div className="grid flex-1 gap-3">
            {[
              ["Hook", 97],
              ["Stands alone", 88],
              ["Payoff", 91],
              ["Quotable", 90],
            ].map(([l, v], i) => (
              <div key={l as string}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{l}</span>
                  <span className="tc text-text">{v}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full origin-left animate-[grow_1.4s_ease-out_both] rounded-full bg-signal" style={{ width: `${v}%`, animationDelay: `${i * 120}ms` }} />
                </div>
              </div>
            ))}
            <p className="mt-1 text-xs leading-relaxed text-faint">&ldquo;Opens on a bold claim and pays it off with the clutch shot inside 40 seconds.&rdquo;</p>
          </div>
        </div>
      </Tile>

      <Tile className="md:col-span-2" title="Three networks, one queue" body="Sign in once per account. Publish now or schedule; due posts go out every 15 minutes." delay={100}>
        <div className="relative mx-auto flex size-40 items-center justify-center">
          <div className="absolute inset-0 animate-[orbit_24s_linear_infinite] rounded-full border border-dashed border-line-strong">
            {ORBIT.map((p, i) => (
              <span
                key={p}
                className="absolute top-1/2 left-1/2"
                style={{ transform: `rotate(${i * 120 - 90}deg) translate(80px) rotate(${-(i * 120 - 90)}deg) translate(-50%, -50%)` }}
              >
                <span className="block animate-[orbit_24s_linear_infinite_reverse]">
                  <PlatformIcon platform={p} size={30} />
                </span>
              </span>
            ))}
          </div>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-signal text-white shadow-lg">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3 8.5 11.5M17 3l-5 14-3.5-5.5L3 8z" />
            </svg>
          </span>
        </div>
      </Tile>

      <Tile className="md:col-span-2" title="Captions you can trust" body="Creator tracks, auto-captions, translations, text tracks and an AI fetch agent, with exact or estimated timing shown on every clip." delay={0}>
        <ul className="space-y-2 text-xs">
          {[
            ["Creator captions", "Exact", true],
            ["Auto-generated", "Exact", true],
            ["Pasted, no timestamps", "Estimated", false],
          ].map(([a, b, ok]) => (
            <li key={a as string} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-text">{a}</span>
              <span className={clsx("rounded-md border px-1.5 py-0.5 font-medium", ok ? "border-ready/40 text-ready" : "border-draft/40 text-draft")}>{b}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile className="md:col-span-2" title="Shorts, uploaded for you" body="Drop the exported clip and it streams straight to YouTube in chunks. Vertical and under 3 minutes becomes a Short." delay={100}>
        <div className="flex h-full flex-col justify-center gap-3">
          <div className="flex items-center gap-3">
            <PlatformIcon platform="youtube" size={34} className="ring-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">clutch-escape-short.mp4</p>
              <p className="text-xs text-muted">Vertical · 0:41 · will appear as a Short</p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full animate-[upload_3.5s_ease-in-out_infinite] rounded-full bg-signal" />
          </div>
        </div>
      </Tile>

      <Tile className="md:col-span-2" title="Numbers from the source" body="Views, likes, comments and shares pulled live from each platform's own API, per network and per post." delay={200}>
        <svg viewBox="0 0 300 120" className="h-full w-full" aria-hidden="true">
          {[30, 60, 90].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" />
          ))}
          <polyline
            points="0,104 30,98 60,92 90,86 120,70 150,74 180,52 210,40 240,30 270,18 300,12"
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="400"
            className="animate-draw"
          />
          <circle cx="300" cy="12" r="4" fill="var(--color-signal)" />
        </svg>
      </Tile>
    </div>
  );
}
