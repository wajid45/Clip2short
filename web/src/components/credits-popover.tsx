import clsx from "clsx";
import { Link } from "@/lib/nav";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The sidebar credits card: the plan, the credits left and (on a plan) how much of the month's
 * credits remain. Clicking it opens Billing, where the full breakdown and history live.
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
  const low = credits < 30;
  const pct = monthlyCredits ? Math.min(100, Math.round((credits / monthlyCredits) * 100)) : null;

  return (
    <Link
      href="/app/billing"
      onClick={() => onNavigate?.()}
      title={collapsed ? `${fmt(credits)} credits left` : "Open Billing"}
      className={clsx(
        "block w-full rounded-lg border text-left transition-colors",
        collapsed ? "flex flex-col items-center px-1 py-2" : "p-3",
        "border-line hover:border-line-strong hover:bg-surface-2",
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
          {pct != null && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className={clsx("h-full rounded-full", low ? "bg-draft" : "bg-signal")} style={{ width: `${pct}%` }} />
            </div>
          )}
        </>
      )}
    </Link>
  );
}
