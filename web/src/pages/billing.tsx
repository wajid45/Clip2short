import clsx from "clsx";
import type { BillingData, Jsonify } from "@server/page-routes";
import { CREDIT_PACKS, getPlan, PLANS, TRIAL } from "@shortlark/shared/plans";
import { IconCheck } from "@shortlark/shared/components/icons";
import { Link, useSearchParams } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { Card, Notice, PageHeader } from "@/components/ui";
import { BuyPackButton, ChoosePlanButton, DevCancelButton, ManageBillingButton } from "@/components/billing-actions";
import { LocalDateTime } from "@/components/local-time";

const STATUS_COPY: Record<string, string> = {
  trialing: "Active",
  active: "Active",
  past_due: "Payment failed: update your card to keep your monthly credits",
  unpaid: "Unpaid: update your card to restore your plan",
  canceled: "Canceled",
  incomplete: "Waiting for payment confirmation",
  paused: "Paused",
};
const SOURCE_LABEL: Record<string, string> = { trial: "Free trial", plan: "Monthly plan", pack: "Credit packs", admin: "Bonus" };
const KIND_LABEL: Record<string, string> = { grant: "Added", spend: "Used", refund: "Refund" };
const fmt = (n: number) => n.toLocaleString("en-US");

export function BillingPage() {
  const sp = useSearchParams();
  const tab = sp.get("tab") === "history" ? "history" : "plan";
  return (
    <PageData<BillingData> path={`/billing${tab === "history" ? "?tab=history" : ""}`} title="Billing">
      {(d) => <Billing d={d} sp={sp} />}
    </PageData>
  );
}

function Billing({ d, sp }: { d: Jsonify<BillingData>; sp: URLSearchParams }) {
  const { mode, active, credits } = d;
  const plan = getPlan(d.plan);
  const packsAvailable = mode !== "unavailable";
  // Choice carried over from the landing page (calculator or plan buttons).
  const wantedPacks = new Map(
    (sp.get("packs") ?? "")
      .split(",")
      .map((x) => x.split(":"))
      .filter(([id, n]) => CREDIT_PACKS.some((p) => p.id === id) && Number(n) > 0)
      .map(([id, n]) => [id, Math.min(20, Number(n))] as const),
  );
  const wantedPlan = PLANS.find((p) => p.id === sp.get("plan")) ?? null;
  // Keep the landing-page picks in the tab links.
  const tabHref = (t: string) => {
    const q = new URLSearchParams();
    if (t === "history") q.set("tab", "history");
    else {
      if (sp.get("plan")) q.set("plan", sp.get("plan")!);
      if (sp.get("packs")) q.set("packs", sp.get("packs")!);
    }
    const s = q.toString();
    return `/app/billing${s ? `?${s}` : ""}`;
  };
  const sources = Object.entries(credits.bySource);

  return (
    <>
      <PageHeader
        title="Billing"
        description="You pay for the video you process: 1 credit = 1 minute of video analysed. Posting and scheduling are always free."
      />

      <div className="mb-8 space-y-3">
        {sp.has("success") && <Notice tone="success">Thanks! Your plan is being activated and your monthly credits will appear in a few seconds.</Notice>}
        {sp.has("credits") && <Notice tone="success">Credits added to your balance.</Notice>}
        {sp.has("required") && credits.total === 0 && !active && (
          <Notice tone="warn">You&apos;re out of credits. Buy a credit pack or choose a monthly plan to keep finding moments.</Notice>
        )}
        {sp.has("canceled") && <Notice>Checkout was canceled. You haven&apos;t been charged.</Notice>}
        {(wantedPlan || wantedPacks.size > 0) && (
          <Notice>
            {wantedPlan
              ? `You picked the ${wantedPlan.name} plan: it's highlighted below.`
              : `You picked ${[...wantedPacks]
                  .map(([id, n]) => `${n > 1 ? `${n} × ` : ""}${fmt(CREDIT_PACKS.find((p) => p.id === id)!.credits)}`)
                  .join(" + ")} credits: buy the highlighted pack${[...wantedPacks.values()].reduce((a, b) => a + b, 0) > 1 ? "s" : ""} below.`}
          </Notice>
        )}
        {mode === "dev" && <Notice tone="warn">Development mode: Stripe isn&apos;t configured, so plans and packs are granted instantly without payment.</Notice>}
        {mode === "unavailable" && <Notice tone="error">Billing isn&apos;t configured on this server yet.</Notice>}
      </div>

      {/* Balance */}
      <Card className="mb-10 p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-muted">Credit balance</p>
            <p className="tc mt-1 text-4xl font-semibold tracking-tight">{fmt(credits.total)}</p>
            <p className="mt-1 text-sm text-muted">
              About {fmt(credits.total)} minutes of video{credits.total >= 120 ? ` (${(credits.total / 60).toFixed(1)} hours)` : ""}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            {active && plan ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{plan.name}</span>{" "}
                  <span className="text-muted">
                    · ${plan.price}/month · {fmt(plan.monthlyCredits)} credits
                  </span>
                </p>
                <p className={clsx("text-sm", d.subscriptionStatus === "past_due" ? "text-danger" : "text-muted")}>
                  {STATUS_COPY[d.subscriptionStatus] ?? d.subscriptionStatus}
                  {d.currentPeriodEnd && (
                    <>
                      {" "}
                      · {d.cancelAtPeriodEnd ? "ends" : "renews"} <LocalDateTime iso={d.currentPeriodEnd} />
                    </>
                  )}
                </p>
                <div className="flex gap-2">
                  {mode === "stripe" && d.hasStripeCustomer && <ManageBillingButton />}
                  {mode === "dev" && <DevCancelButton />}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">No monthly plan</p>
            )}
          </div>
        </div>
        {sources.length > 0 && (
          <div className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
            {sources.map(([source, b]) => (
              <div key={source}>
                <p className="text-xs text-muted">{SOURCE_LABEL[source] ?? source}</p>
                <p className="tc mt-1 text-lg text-text">{fmt(b.remaining)}</p>
                <p className="text-xs text-faint">
                  {b.expiresAt ? (
                    <>
                      {source === "plan" ? "Resets" : "Expires"} <LocalDateTime iso={b.expiresAt} />
                    </>
                  ) : (
                    "Never expires"
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div role="tablist" aria-label="Billing sections" className="mb-8 flex gap-1 border-b border-line">
        {[
          { id: "plan", label: "Current plan" },
          { id: "history", label: "Credit history" },
        ].map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            role="tab"
            aria-selected={d.tab === t.id}
            scroll={false}
            className={clsx(
              "-mb-px border-b-2 px-3.5 pb-3 text-sm font-medium transition-colors",
              d.tab === t.id ? "border-signal text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {d.tab === "plan" && (
        <>
          {/* Credit packs */}
          <section id="packs" className="mb-12 scroll-mt-8">
            <h2 className="text-lg font-semibold tracking-tight">Credit packs</h2>
            <p className="mt-1 mb-5 text-sm text-muted">One-off top-ups. They never expire and stack with any plan.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {CREDIT_PACKS.map((p, i) => (
                <Card key={p.id} className={clsx("flex flex-col p-5", wantedPacks.has(p.id) && "border-signal ring-1 ring-signal")}>
                  {wantedPacks.has(p.id) && (
                    <p className="mb-2 text-xs font-medium text-signal">
                      Your pick{(wantedPacks.get(p.id) ?? 1) > 1 ? ` · buy ${wantedPacks.get(p.id)}×` : ""}
                    </p>
                  )}
                  <p className="tc text-2xl font-semibold">
                    {fmt(p.credits)} <span className="text-sm font-normal text-muted">credits</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    ${p.price} · {((p.price / p.credits) * 100).toFixed(1)}¢ per minute
                  </p>
                  <div className="mt-5">
                    {packsAvailable ? (
                      <BuyPackButton
                        pack={p.id}
                        highlight={wantedPacks.size ? wantedPacks.has(p.id) : i === 1}
                        label={mode === "dev" ? `Add ${fmt(p.credits)} (dev)` : `Buy for $${p.price}`}
                      />
                    ) : (
                      <p className="text-sm text-faint">Unavailable</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Plans */}
          <section className="mb-12">
            <h2 className="text-lg font-semibold tracking-tight">Monthly plans</h2>
            <p className="mt-1 mb-5 text-sm text-muted">
              The cheapest way to clip regularly. Credits refresh every billing period; unused monthly credits don&apos;t roll over.
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {PLANS.map((p) => {
                const current = active && p.id === d.plan;
                return (
                  <Card
                    key={p.id}
                    className={clsx(
                      "flex flex-col p-6",
                      wantedPlan?.id === p.id ? "border-signal ring-1 ring-signal" : p.highlight && !wantedPlan && "border-signal/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {p.highlight && <span className="rounded-md bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal">Most popular</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                    <p className="mt-5 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight">${p.price}</span>
                      <span className="text-sm text-muted">/month</span>
                    </p>
                    <p className="mt-1 text-xs text-faint">{((p.price / p.monthlyCredits) * 100).toFixed(1)}¢ per minute of video</p>
                    <ul className="mt-5 mb-6 flex-1 space-y-2.5">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-muted">
                          <IconCheck size={16} className="mt-0.5 shrink-0 text-signal" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {current ? (
                      <p className="flex h-10 items-center justify-center rounded-lg border border-line text-sm text-muted">Current plan</p>
                    ) : (
                      <ChoosePlanButton
                        plan={p.id}
                        mode={active && mode === "stripe" ? "unavailable" : mode}
                        highlight={wantedPlan ? wantedPlan.id === p.id : p.highlight}
                        label={mode === "dev" ? `Activate ${p.name} (dev)` : active ? "Change in Manage billing" : `Choose ${p.name}`}
                      />
                    )}
                  </Card>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-faint">
              New accounts get {TRIAL.credits} free credits for {TRIAL.days} days. Finding moments costs 1 credit per minute of video; running it again on
              the same video costs a quarter of that. If analysis fails, the credits are refunded automatically.
            </p>
          </section>
        </>
      )}

      {d.tab === "history" && d.history && (
        <section>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-xs text-muted">Credits added</p>
              <p className="tc mt-1 text-2xl font-semibold text-ready">+{fmt(d.history.added)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-muted">Credits used</p>
              <p className="tc mt-1 text-2xl font-semibold">{fmt(d.history.used)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-muted">Transactions</p>
              <p className="tc mt-1 text-2xl font-semibold">{fmt(d.history.count)}</p>
            </Card>
          </div>
          {d.history.rows.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted">No credit activity yet.</Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">What</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.rows.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className="tc px-4 py-2.5 text-xs whitespace-nowrap text-muted">
                        <LocalDateTime iso={t.createdAt} />
                      </td>
                      <td className="px-4 py-2.5 text-text">
                        {t.description}
                        {t.refundedAt && <span className="ml-2 text-xs text-faint">(refunded)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">{KIND_LABEL[t.kind] ?? t.kind}</td>
                      <td className={clsx("tc px-4 py-2.5 text-right font-medium", t.delta > 0 ? "text-ready" : "text-text")}>
                        {t.delta > 0 ? "+" : "−"}
                        {fmt(Math.abs(t.delta))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.history.count > d.history.rows.length && (
            <p className="mt-3 text-xs text-faint">
              Showing the latest {d.history.rows.length} of {fmt(d.history.count)} transactions.
            </p>
          )}
        </section>
      )}
    </>
  );
}
