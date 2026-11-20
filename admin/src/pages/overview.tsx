import { Link } from "react-router";
import { ColumnChart, LineChart, dayLong, dayShort, monthLong, monthShort } from "../components/charts";
import { Alert, Badge, Card, PageHeader, SectionTitle, Spinner, Stat } from "../components/ui";
import { num, usd, useLive, when } from "../lib/api";

interface Overview {
  generatedAt: string;
  kpis: {
    users: number;
    newToday: number;
    new7d: number;
    new30d: number;
    suspended: number;
    paid: number;
    byPlan: Record<string, number>;
    mrr: number;
    packs30d: number;
    packRevenue30d: number;
    creditsSpent30d: number;
    creditsRefunded30d: number;
    creditsGranted30d: Record<string, number>;
    creditBalance: number;
    videos30d: number;
    analyses30d: number;
    failedAnalyses30d: number;
    published30d: number;
    failedPosts30d: number;
    queued: number;
  };
  signupsByMonth: { key: string; n: number }[];
  signupsByDay: { key: string; n: number }[];
  creditsByDay: { key: string; n: number }[];
  videosByDay: { key: string; n: number }[];
  recentSignups: { id: string; email: string; name: string | null; plan: string; subscriptionStatus: string; createdAt: string }[];
}

const PLAN_NAMES: Record<string, string> = { creator: "Creator", pro: "Pro", studio: "Studio" };

export function OverviewPage() {
  const live = useLive<Overview>("/overview", 30_000);
  const d = live.data;
  const k = d?.kpis;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Accounts, money, usage and health at a glance. Refreshes every 30 seconds; hover any (i) for what a number means."
        updatedAt={live.updatedAt}
        loading={live.loading}
        onRefresh={() => void live.refresh()}
      />
      {live.error && <Alert kind="error">{live.error}</Alert>}
      {!d || !k ? (
        <Spinner />
      ) : (
        <>
          <SectionTitle>Accounts</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Users"
              value={num(k.users)}
              sub={`+${k.newToday} today · +${k.new7d} this week`}
              trend={d.signupsByDay.map((p) => p.n)}
              hint="Every registered account, including suspended ones. The line is sign-ups per day over the last 30 days."
            />
            <Stat
              label="Paying"
              value={num(k.paid)}
              tone="brand"
              sub={Object.entries(k.byPlan)
                .map(([p, n]) => `${PLAN_NAMES[p] ?? p} ${n}`)
                .join(" · ")}
              hint="Accounts with an active or trialing subscription right now."
            />
            <Stat label="New in 30 days" value={num(k.new30d)} sub={k.users ? `${Math.round((k.new30d / k.users) * 100)}% of all accounts` : ""} hint="Accounts created in the last 30 days." />
            <Stat
              label="Suspended"
              value={num(k.suspended)}
              tone={k.suspended ? "warn" : undefined}
              sub={<Link to="/users?filter=suspended" className="text-signal hover:underline">See who</Link>}
              hint="Accounts an admin suspended. They can't sign in until lifted."
            />
          </div>

          <SectionTitle hint="Money is estimated from plan prices and credit packs in pricing.json; Stripe remains the source of truth for payouts.">Money</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="MRR" value={usd(k.mrr)} tone="success" sub="Monthly recurring revenue" hint="What today's active subscriptions are worth per month at their plan price. Credit packs are one-off, so they're not included." />
            <Stat label="ARR run rate" value={usd(k.mrr * 12)} sub="MRR × 12" hint="A forecast: MRR for a year if nobody joins or cancels." />
            <Stat label="Credit packs (30 days)" value={num(k.packs30d)} sub={`${usd(k.packRevenue30d)} at list price`} hint="One-off packs bought in the last 30 days, priced from pricing.json." />
            <Stat
              label="Credits granted (30 days)"
              value={num(Object.values(k.creditsGranted30d).reduce((a, b) => a + b, 0))}
              sub={Object.entries(k.creditsGranted30d)
                .map(([src, n]) => `${src} ${num(n)}`)
                .join(" · ") || "none"}
              hint="Credits added by source: trial, plan renewals, packs and admin grants."
            />
          </div>

          <SectionTitle>Usage</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Credits spent (30 days)" value={num(k.creditsSpent30d)} sub={`${num(k.creditsRefunded30d)} refunded for failed analyses`} trend={d.creditsByDay.map((p) => p.n)} hint="1 credit is 1 minute of video analysed. Failed analyses are refunded automatically." />
            <Stat label="Videos imported (30 days)" value={num(k.videos30d)} sub={`${num(k.analyses30d)} analysed`} trend={d.videosByDay.map((p) => p.n)} hint="Links pasted into Shortlark, and how many finished an AI analysis." />
            <Stat label="Posts published (30 days)" value={num(k.published30d)} sub={`${num(k.queued)} waiting in queues`} hint="Clips posted to YouTube, Instagram and Facebook." />
            <Stat label="Unused credits" value={num(k.creditBalance)} sub="across all accounts, not expired" hint="Credits customers hold right now. A liability if you ever refund them." />
          </div>

          <SectionTitle>Needs attention</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Failed analyses (30 days)" value={num(k.failedAnalyses30d)} tone={k.failedAnalyses30d ? "danger" : "success"} sub="AI couldn't finish; credits were refunded" hint="Usually a missing or rate-limited GEMINI_API_KEY, or a video without usable captions." />
            <Stat label="Failed posts (30 days)" value={num(k.failedPosts30d)} tone={k.failedPosts30d ? "danger" : "success"} sub="Customer sees a retry button" hint="Publishing errors from the networks: expired tokens, rejected files, rate limits." />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="New accounts per month" description="Last 12 calendar months.">
              <ColumnChart
                data={d.signupsByMonth.map((p) => ({ label: monthShort(p.key), title: monthLong(p.key), value: p.n }))}
                xNote="one column per month"
                yNote="accounts created"
              />
            </Card>
            <Card title="Credits spent per day" description="Minutes of video analysed, last 30 days.">
              <LineChart
                data={d.creditsByDay.map((p) => ({ label: dayShort(p.key), title: dayLong(p.key), value: p.n }))}
                xNote="one point per day, oldest on the left"
                yNote="credits spent"
              />
            </Card>
          </div>

          <Card className="mt-4" title="Latest sign-ups" action={<Link to="/users" className="text-[13px] text-signal hover:underline">All users</Link>} pad={false}>
            <ul className="divide-y divide-line">
              {d.recentSignups.map((u) => (
                <li key={u.id}>
                  <Link to={`/users/${u.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text">{u.name || u.email}</span>
                      <span className="block truncate text-xs text-faint">{u.email}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {["active", "trialing"].includes(u.subscriptionStatus) && PLAN_NAMES[u.plan] ? <Badge tone="brand">{PLAN_NAMES[u.plan]}</Badge> : <Badge>Free</Badge>}
                      <span className="w-24 text-right text-xs text-faint">{when(u.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
