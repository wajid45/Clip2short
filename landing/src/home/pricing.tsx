import clsx from "clsx";
import { PLANS, enginesText, type Plan } from "@shortlark/shared/plans";
import { SplitRise } from "../motion/split";
import { appHref } from "../config";

const hours = (credits: number) => Math.round((credits / 60) * 10) / 10;
const MAX_HOURS = hours(Math.max(...PLANS.map((p) => p.monthlyCredits)));

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={clsx("size-5 shrink-0", className)} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M6 10.4l2.6 2.5L14 7.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={clsx("size-5 shrink-0", className)} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const NETWORK: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram" };
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Five headline points per plan, as [text, included]: what it covers plus its top feature.
 *  The full list is the comparison table on the pricing page. */
function planPoints(plan: Plan): [string, boolean][] {
  const l = plan.limits;
  const top = l.postAnalytics ? "Analytics per post" : l.scheduling ? "Posting and scheduling" : l.captions ? "AI hooks and captions" : "Posting to your channels";
  return [
    [`${plan.monthlyCredits.toLocaleString("en-US")} credits every month`, true],
    [l.maxVideoMinutes ? `Videos up to ${l.maxVideoMinutes / 60} ${l.maxVideoMinutes > 60 ? "hours" : "hour"}` : "Videos of any length", true],
    [`Connect ${list(l.networks.map((n) => NETWORK[n] ?? n))}`, true],
    [enginesText(l.engines), true],
    [top, true],
  ];
}

/** One plan. The highlighted plan is the dark card from the call to action, framed in the sunset gradient. */
export function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const dark = !!plan.highlight;
  const h = hours(plan.monthlyCredits);
  const card = (
    <article
      className={clsx(
        "relative flex h-full flex-col overflow-hidden rounded-[28px] p-7 sm:p-8 [@media(min-width:1024px)_and_(max-height:820px)]:py-6",
        dark ? "bg-[#0d0e12] text-white" : "border border-line bg-surface transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[0_30px_80px_-50px_rgba(0,0,0,0.35)]",
      )}
    >
      {dark && <div className="plan-glow pointer-events-none absolute inset-x-0 -top-24 h-64" aria-hidden="true" />}

      <div className="relative flex items-center justify-between gap-3">
        <h3 className="text-[34px] leading-none tracking-[-0.03em]">{plan.name}</h3>
        {dark && <span className="rounded-full bg-signal px-3 py-1 text-[13px] text-on-signal">Most popular</span>}
      </div>

      <p className="relative mt-5 flex items-baseline gap-2">
        <span className="text-[clamp(48px,4vw,64px)] leading-none tracking-[-0.045em]" aria-label={`$${plan.price}`}>
          <span className="price-dollar" aria-hidden="true">$</span>
          {plan.price}
        </span>
        <span className={clsx("hud", dark ? "text-white/55" : "text-muted")}>/ month</span>
      </p>

      {/* How much video the plan covers, against the biggest plan */}
      <div className="relative mt-5">
        <div className="flex items-baseline justify-between">
          <span className={clsx("hud", dark ? "text-white/55" : "text-muted")}>Video each month</span>
          <span className="text-[16px]">
            {h} hours
          </span>
        </div>
        <span className={clsx("mt-3 block h-2 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-surface-3")}>
          <span className={clsx("block h-full rounded-full", dark ? "bg-sunset" : "bg-signal")} style={{ width: `${Math.max(8, (h / MAX_HOURS) * 100)}%` }} />
        </span>
      </div>

      <ul className={clsx("relative mt-6 mb-7 flex-1 space-y-2.5 border-t pt-6 [@media(min-width:1024px)_and_(max-height:820px)]:mt-5 [@media(min-width:1024px)_and_(max-height:820px)]:mb-6 [@media(min-width:1024px)_and_(max-height:820px)]:pt-5", dark ? "border-white/10" : "border-line")}>
        {planPoints(plan).map(([text, on]) => (
          <li key={text} className="flex gap-3 text-[16px]">
            {on ? <Check className="text-signal" /> : <Cross className={dark ? "text-white/35" : "text-faint"} />}
            <span className={on ? (dark ? "text-white/85" : "text-text") : clsx("line-through", dark ? "text-white/35" : "text-faint")}>{text}</span>
          </li>
        ))}
      </ul>

      <a
        href={appHref(`/signup?plan=${plan.id}`)}
        className={clsx(
          "relative inline-flex h-12 items-center justify-center rounded-full text-[16px] transition-colors",
          dark ? "bg-signal text-on-signal hover:bg-signal-strong" : "border border-signal text-signal hover:bg-signal hover:text-on-signal",
        )}
      >
        Choose {plan.name}
      </a>
    </article>
  );
  return dark ? <div className="rounded-[32px] bg-sunset p-[2px] shadow-[0_24px_48px_-30px_rgba(217,72,15,0.3)] lg:-my-3">{card}</div> : card;
}

/** The three plan cards in a row (home page and /pricing). */
export function PlanGrid() {
  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:items-stretch [@media(min-width:1024px)_and_(max-height:820px)]:mt-7">
      {PLANS.map((p, i) => (
        <PlanCard key={p.id} plan={p} index={i} />
      ))}
    </div>
  );
}

/** Home page pricing: the plans, with the calculator and full comparison on /pricing. */
export function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-0 py-20 sm:py-24 [@media(min-width:1024px)_and_(max-height:820px)]:pt-[84px]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="hud text-muted">
              <span className="text-signal">/</span> Pricing
            </p>
            <SplitRise as="h2" className="display mt-4 text-[clamp(40px,4.6vw,72px)] [@media(min-width:1024px)_and_(max-height:820px)]:text-[46px]" parts={["Pay for the minutes you clip"]} />
          </div>
        </div>

        <PlanGrid />

        <div className="mt-8 flex justify-center">
          <a href="/pricing" className="ulink inline-flex">
            Compare plans and find yours <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
