import type { ReactNode } from "react";
import { LineChart, Sparkline, dayLong, dayShort } from "@shortlark/shared/components/charts";
import { Link } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { Card, PageHeader } from "@/components/ui";

type Series = { key: string; n: number }[];

interface OverviewData {
  credits: number;
  bySource: Record<string, { remaining: number; expiresAt: string | null }>;
  planName: string | null;
  monthlyCredits: number | null;
  renewsAt: string | null;
  creditsSpent30d: number;
  videos30d: number;
  videosTotal: number;
  clips30d: number;
  clipsTotal: number;
  published30d: number;
  queued: number;
  nextScheduledAt: string | null;
  creditsByDay: Series;
  videosByDay: Series;
  clipsByDay: Series;
  postsByDay: Series;
  topClips: { id: string; title: string; score: number; momentLabel: string | null; status: string; video: string }[];
}

const fmt = (n: number) => n.toLocaleString("en-US");
const line = (s: Series) => s.map((p) => p.n);

/** One figure with its 30-day line, in the admin portal's style. */
function Tile({ label, value, sub, trend }: { label: string; value: ReactNode; sub?: ReactNode; trend?: number[] }) {
  return (
    <Card className="p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="num text-[30px] leading-none text-text">{value}</p>
        {trend && trend.length > 1 && <Sparkline points={trend} color="var(--color-ready)" />}
      </div>
      {sub && <p className="mt-2 truncate text-xs text-faint">{sub}</p>}
    </Card>
  );
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * When the credits refresh or run out (the balance itself is in the sidebar): days left in the plan
 * period with how much of the month's credits remain, or days left on the free trial.
 */
function PeriodTile({ d }: { d: OverviewData }) {
  const plan = d.bySource.plan;
  const trial = d.bySource.trial;
  const ends = d.renewsAt ?? trial?.expiresAt ?? null;
  const days = ends ? Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / DAY)) : null;
  const label = d.planName ? `${d.planName} renews in` : trial ? "Free trial ends in" : "No plan yet";
  const left = plan?.remaining ?? 0;
  const share = d.monthlyCredits ? Math.min(1, left / d.monthlyCredits) : null;
  return (
    <Card className="p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="num mt-2 text-[30px] leading-none text-text">{days === null ? "·" : `${days} ${days === 1 ? "day" : "days"}`}</p>
      {share !== null ? (
        <>
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-ready" style={{ width: `${Math.max(3, share * 100)}%` }} />
          </span>
          <p className="mt-2 truncate text-xs text-faint">
            {fmt(left)} of {fmt(d.monthlyCredits ?? 0)} plan credits left
          </p>
        </>
      ) : (
        <p className="mt-2 truncate text-xs text-faint">{trial ? `${fmt(trial.remaining)} trial credits left` : "Choose a plan in Billing"}</p>
      )}
    </Card>
  );
}

/** The customer's dashboard: credits, what they processed and posted, and their best clips. */
export function OverviewPage() {
  return (
    <PageData<OverviewData> path="/overview" title="Overview">
      {(d) => (
        <>
          <PageHeader title="Overview" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/app/billing" className="rounded-[var(--radius-card)] transition-transform hover:-translate-y-0.5">
              <PeriodTile d={d} />
            </Link>
            <Tile label="Credits used (30 days)" value={fmt(d.creditsSpent30d)} sub="1 credit is 1 minute of video" trend={line(d.creditsByDay)} />
            <Tile label="Videos (30 days)" value={fmt(d.videos30d)} sub={`${fmt(d.videosTotal)} in total`} trend={line(d.videosByDay)} />
            <Tile label="Clips (30 days)" value={fmt(d.clips30d)} sub={`${fmt(d.clipsTotal)} in total`} trend={line(d.clipsByDay)} />
            <Link href="/app/analytics" className="rounded-[var(--radius-card)] transition-transform hover:-translate-y-0.5">
              <Tile label="Posted (30 days)" value={fmt(d.published30d)} sub="to YouTube, Instagram and Facebook" trend={line(d.postsByDay)} />
            </Link>
            <Link href="/app/queue" className="rounded-[var(--radius-card)] transition-transform hover:-translate-y-0.5">
              <Tile
                label="Scheduled"
                value={fmt(d.queued)}
                sub={d.nextScheduledAt ? `next ${new Date(d.nextScheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "nothing waiting"}
              />
            </Link>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Card className="p-5">
              <h2 className="mb-2 text-[15px] font-medium text-text">Credits used per day</h2>
              <LineChart
                data={d.creditsByDay.map((p) => ({ label: dayShort(p.key), title: dayLong(p.key), value: p.n }))}
                xLabel="Day"
                yLabel="Credits used"
                color="var(--color-ready)"
              />
            </Card>
            <Card className="flex flex-col p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[15px] font-medium text-text">Your best clips</h2>
                <Link href="/app/moments" className="text-[13px] text-signal hover:underline">
                  All moments
                </Link>
              </div>
              {d.topClips.length === 0 ? (
                <p className="my-auto py-8 text-center text-sm text-muted">Your best clips will show here after your first analysis.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {d.topClips.map((c) => (
                    <li key={c.id}>
                      <Link href={`/app/clips/${c.id}`} className="flex items-center gap-3 py-2.5 hover:text-signal">
                        <span className="num w-9 shrink-0 text-[20px] text-ready">{c.score}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text">{c.title}</span>
                          <span className="block truncate text-xs text-faint">
                            {c.momentLabel ? `${c.momentLabel} · ` : ""}
                            {c.video}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </PageData>
  );
}
