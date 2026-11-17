"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface CreditsData {
  total: number;
  bySource: Record<string, { remaining: number; expiresAt: string | null }>;
  recent: { id: string; delta: number; kind: string; description: string; createdAt: string; refundedAt: string | null }[];
}

const SOURCE_LABEL: Record<string, string> = { plan: "Monthly plan", trial: "Free trial", pack: "Credit packs", admin: "Bonus" };
const fmt = (n: number) => n.toLocaleString("en-US");

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * The sidebar credits card. Clicking it opens a popover with the balance breakdown and
 * recent credit history, with links to buy credits or see the full history.
 */
export function CreditsPopover({
  credits,
  planName,
  monthlyCredits,
  collapsed,
  onNavigate,
}: {
  credits: number;
  planName: string | null;
  monthlyCredits: number | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CreditsData | null>(null);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(false);
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const low = credits < 30;
  const pct = monthlyCredits ? Math.min(100, Math.round((credits / monthlyCredits) * 100)) : null;
  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={collapsed ? `${fmt(credits)} credits left` : undefined}
        className={clsx(
          "w-full rounded-lg border text-left transition-colors",
          collapsed ? "flex flex-col items-center px-1 py-2" : "block p-3",
          low ? "border-signal/40 bg-signal-soft" : "border-line hover:border-line-strong",
          open && "border-line-strong bg-surface-2",
        )}
      >
        {collapsed ? (
          <>
            <span className="tc text-xs font-semibold text-text">{credits >= 10000 ? `${Math.round(credits / 1000)}k` : fmt(credits)}</span>
            <span className="text-[10px] text-faint">credits</span>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text">{planName ?? "Credits"}</span>
              <span className="tc text-muted">{fmt(credits)} left</span>
            </div>
            {pct != null ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className={clsx("h-full rounded-full", low ? "bg-draft" : "bg-signal")} style={{ width: `${pct}%` }} />
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-faint">1 credit = 1 minute of video</p>
            )}
            {low && <p className="mt-2 text-[11px] font-medium text-signal">Running low · Buy credits</p>}
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Credits"
          className={clsx(
            "absolute z-50 w-80 rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]",
            collapsed ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2",
          )}
        >
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-muted">Credit balance</p>
            <p className="text-[11px] text-faint">1 credit = 1 min</p>
          </div>
          <p className="tc mt-0.5 text-3xl font-semibold tracking-tight text-text">{fmt(data?.total ?? credits)}</p>

          {data && Object.keys(data.bySource).length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
              {Object.entries(data.bySource).map(([src, b]) => (
                <li key={src} className="flex items-center justify-between gap-2">
                  <span className="text-muted">{SOURCE_LABEL[src] ?? src}</span>
                  <span className="text-right">
                    <span className="tc text-text">{fmt(b.remaining)}</span>
                    <span className="ml-1.5 text-faint">
                      {b.expiresAt ? `${src === "plan" ? "resets" : "expires"} ${new Date(b.expiresAt).toLocaleDateString([], { month: "short", day: "numeric" })}` : "no expiry"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-xs font-medium text-muted">Recent activity</p>
            {error ? (
              <p className="text-xs text-danger">Couldn&apos;t load history.</p>
            ) : !data ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-surface-3" />
                ))}
              </div>
            ) : data.recent.length === 0 ? (
              <p className="text-xs text-faint">No credit activity yet.</p>
            ) : (
              <ul className="scroll-thin max-h-56 space-y-2 overflow-y-auto pr-1">
                {data.recent.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-text">
                        {t.description}
                        {t.refundedAt && <span className="ml-1 text-faint">(refunded)</span>}
                      </p>
                      <p className="text-faint">{when(t.createdAt)}</p>
                    </div>
                    <span className={clsx("tc shrink-0 font-medium", t.delta > 0 ? "text-ready" : "text-text")}>
                      {t.delta > 0 ? "+" : "−"}
                      {fmt(Math.abs(t.delta))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/app/billing?tab=history"
              onClick={close}
              className="flex h-9 items-center justify-center rounded-lg border border-line text-[13px] text-text hover:border-line-strong"
            >
              Full history
            </Link>
            <Link
              href="/app/billing#packs"
              onClick={close}
              className="flex h-9 items-center justify-center rounded-lg bg-signal text-[13px] font-medium text-white hover:bg-signal-strong"
            >
              Buy credits
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
