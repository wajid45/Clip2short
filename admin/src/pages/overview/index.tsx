import { Link } from "react-router";
import { IconArrowRight } from "@shortlark/shared/components/icons";
import { ColumnChart, LineChart, dayLong, dayShort, monthLong, monthShort } from "../../components/charts";
import { Alert, Badge, Card, PageHeader, SectionTitle, Spinner, Stat, Table } from "../../components/ui";
import { num, usd, useLive, when } from "../../lib/api";

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
  paidByDay: Series;
  packsByDay: Series;
  revenueByDay: Series;
  grantsByDay: Series;
  netCreditsByDay: Series;
  suspendedByDay: Series;
  publishedByDay: Series;
  failedAnalysesByDay: Series;
  failedPostsByDay: Series;
  ai: {
    calls30d: number;
    inputTokens30d: number;
    outputTokens30d: number;
    cost30d: number;
    unpricedCalls30d: number;
    pricesSet: boolean;
    byModel: { model: string; calls: number; tokens: number; cost: number; priced: boolean }[];
    costByDay: Series;
    callsByDay: Series;
    tokensByDay: Series;
  };
  recentSignups: { id: string; email: string; name: string | null; plan: string; subscriptionStatus: string; createdAt: string }[];
}

type Series = { key: string; n: number }[];
const line = (s: Series) => s.map((p) => p.n);
/** Tokens as people read them: 812, 14.2K, 3.1M. */
const tokens = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const dollars = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 }).format(n);

const PLAN_NAMES: Record<string, string> = { creator: "Creator", pro: "Pro", studio: "Studio" };

export function OverviewPage() {
  const live = useLive<Overview>("/overview", 30_000);
  const d = live.data;
  const k = d?.kpis;

  return (
    <>
      <PageHeader
        title="Overview"
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
              hint="Accounts with an active or trialing subscription right now. The line is plan payments per day."
              trend={line(d.paidByDay)}
            />
            <Stat label="New in 30 days" value={num(k.new30d)} sub={k.users ? `${Math.round((k.new30d / k.users) * 100)}% of all accounts` : ""} hint="Accounts created in the last 30 days. The line is sign-ups per day." trend={line(d.signupsByDay)} />
            <Stat
              label="Suspended"
              value={num(k.suspended)}
              tone={k.suspended ? "warn" : undefined}
              sub={<Link to="/users?filter=suspended" className="text-signal hover:underline">See who</Link>}
              hint="Accounts an admin suspended. They can't sign in until lifted. The line is suspensions per day."
              trend={line(d.suspendedByDay)} trendTone="bad"
            />
          </div>

          <SectionTitle hint="Money is estimated from plan prices and credit packs in pricing.json; Stripe remains the source of truth for payouts.">Money</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="MRR" value={usd(k.mrr)} tone="success" sub="Monthly recurring revenue" hint="What today's active subscriptions are worth per month at their plan price. Credit packs are one-off, so they're not included. The line is revenue per day." trend={line(d.revenueByDay)} />
            <Stat label="ARR run rate" value={usd(k.mrr * 12)} sub="MRR × 12" hint="A forecast: MRR for a year if nobody joins or cancels. The line is revenue per day." trend={line(d.revenueByDay)} />
            <Stat label="Credit packs (30 days)" value={num(k.packs30d)} sub={`${usd(k.packRevenue30d)} at list price`} hint="One-off packs bought in the last 30 days, priced from pricing.json. The line is packs per day." trend={line(d.packsByDay)} />
            <Stat
              label="Credits granted (30 days)"
              value={num(Object.values(k.creditsGranted30d).reduce((a, b) => a + b, 0))}
              sub={Object.entries(k.creditsGranted30d)
                .map(([src, n]) => `${src} ${num(n)}`)
                .join(" · ") || "none"}
              hint="Credits added by source: trial, plan renewals, packs and admin grants. The line is credits added per day."
              trend={line(d.grantsByDay)}
            />
          </div>

          <SectionTitle>Usage</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Credits spent (30 days)" value={num(k.creditsSpent30d)} sub={`${num(k.creditsRefunded30d)} refunded for failed analyses`} trend={d.creditsByDay.map((p) => p.n)} hint="1 credit is 1 minute of video analysed. Failed analyses are refunded automatically." />
            <Stat label="Videos imported (30 days)" value={num(k.videos30d)} sub={`${num(k.analyses30d)} analysed`} trend={d.videosByDay.map((p) => p.n)} hint="Links pasted into Clip2Short, and how many finished an AI analysis." />
            <Stat label="Posts published (30 days)" value={num(k.published30d)} sub={`${num(k.queued)} waiting in queues`} hint="Clips posted to YouTube, Instagram and Facebook. The line is posts per day." trend={line(d.publishedByDay)} />
            <Stat label="Unused credits" value={num(k.creditBalance)} sub="across all accounts, not expired" hint="Credits customers hold right now. A liability if you ever refund them. The line is credits added minus credits spent per day." trend={line(d.netCreditsByDay)} />
          </div>

          <SectionTitle hint="Every Gemini request is counted. Cost uses the prices in GEMINI_PRICES (US dollars per million tokens), so check them against Google's current pricing.">AI spending</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Gemini cost (30 days)"
              value={d.ai.pricesSet ? dollars(d.ai.cost30d) : "Not set"}
              tone={d.ai.pricesSet ? "brand" : undefined}
              sub={
                !d.ai.pricesSet
                  ? "Add GEMINI_PRICES to backend/.env"
                  : d.ai.unpricedCalls30d
                    ? `${num(d.ai.unpricedCalls30d)} calls on models without a price`
                    : "at the prices in GEMINI_PRICES"
              }
              hint="What the AI cost over the last 30 days: input tokens × input price + output and thinking tokens × output price. The line is cost per day."
              trend={line(d.ai.costByDay)}
              trendTone="cost"
            />
            <Stat label="AI requests (30 days)" value={num(d.ai.calls30d)} sub="analyses, post copy and link reading" hint="Requests sent to Gemini. The line is requests per day." trend={line(d.ai.callsByDay)} />
            <Stat
              label="Tokens (30 days)"
              value={tokens(d.ai.inputTokens30d + d.ai.outputTokens30d)}
              sub={`${tokens(d.ai.inputTokens30d)} in · ${tokens(d.ai.outputTokens30d)} out`}
              hint="Input is the transcript and instructions sent; output is the answer plus the model's thinking. Output usually costs several times more per token. The line is tokens per day."
              trend={line(d.ai.tokensByDay)}
            />
            <Stat
              label="Cost per credit spent"
              value={d.ai.pricesSet && k.creditsSpent30d ? dollars(d.ai.cost30d / k.creditsSpent30d) : "Not set"}
              sub={d.ai.pricesSet && k.creditsSpent30d ? `vs ${dollars(k.mrr && k.creditsSpent30d ? k.mrr / Math.max(1, k.creditsSpent30d) : 0)} MRR per credit spent` : "needs prices and some usage"}
              hint="AI cost divided by the credits customers spent (1 credit is 1 minute of video). Keep it well under what a credit earns you."
            />
          </div>
          {d.ai.byModel.length > 0 && (
            <Card className="mt-3" title="By model (30 days)" pad={false}>
              <Table head={["Model", "Requests", "Tokens", "Cost"]} minWidth={520}>
                {d.ai.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 text-text">{m.model}</td>
                    <td className="num px-4 py-2.5 text-muted">{num(m.calls)}</td>
                    <td className="num px-4 py-2.5 text-muted">{tokens(m.tokens)}</td>
                    <td className="num px-4 py-2.5 text-text">{m.priced ? dollars(m.cost) : <span className="text-faint">No price set</span>}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <SectionTitle>Needs attention</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Failed analyses (30 days)" value={num(k.failedAnalyses30d)} tone={k.failedAnalyses30d ? "danger" : "success"} sub="AI couldn't finish; credits were refunded" hint="Usually a missing or rate-limited GEMINI_API_KEY, or a video without usable captions." trend={line(d.failedAnalysesByDay)} trendTone="bad" />
            <Stat label="Failed posts (30 days)" value={num(k.failedPosts30d)} tone={k.failedPosts30d ? "danger" : "success"} sub="Customer sees a retry button" hint="Publishing errors from the networks: expired tokens, rejected files, rate limits." trend={line(d.failedPostsByDay)} trendTone="bad" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="New accounts per month">
              <ColumnChart
                data={d.signupsByMonth.map((p) => ({ label: monthShort(p.key), title: monthLong(p.key), value: p.n }))}
                xLabel="Month"
                color="var(--color-ready)"
                yLabel="Accounts created"
              />
            </Card>
            <Card title="Credits spent per day">
              <LineChart
                data={d.creditsByDay.map((p) => ({ label: dayShort(p.key), title: dayLong(p.key), value: p.n }))}
                xLabel="Day"
                yLabel="Credits spent"
                color="var(--color-ready)"
              />
            </Card>
          </div>

          <Card className="mt-4" title="Latest sign-ups" action={<Link to="/users" className="inline-flex items-center gap-1 text-[13px] text-signal hover:underline">All users <IconArrowRight size={13} /></Link>} pad={false}>
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
