import { PLANS, TRIAL, enginesText } from "@shortlark/shared/plans";
import { CreditCalculator } from "@/components/landing/credit-calculator";
import { PlanGrid } from "../../home/pricing";
import { PageHero } from "../../site/page-hero";
import { FaqList, FinalCta, Section, SectionHead } from "../../site/kit";
import { FAQ_GROUPS } from "../../content/faq";

const hours = (credits: number) => Math.round((credits / 60) * 10) / 10;
const NETWORK: Record<string, string> = { youtube: "YT", facebook: "FB", instagram: "IG" }; // short forms keep the row on one line

/** The full pricing page: plans, the calculator, a side-by-side comparison and billing questions. */
export function PricingPage() {
  const rows: [string, (p: (typeof PLANS)[number]) => string][] = [
    ["Credits every month", (p) => p.monthlyCredits.toLocaleString("en-US")],
    ["Video analysed each month", (p) => `${hours(p.monthlyCredits)} hours`],
    ["Longest video", (p) => (p.limits.maxVideoMinutes ? `${p.limits.maxVideoMinutes / 60} ${p.limits.maxVideoMinutes > 60 ? "hours" : "hour"}` : "Unlimited")],
    ["Social networks", (p) => p.limits.networks.map((n) => NETWORK[n] ?? n).join(", ")],
    ["Posts in the queue", (p) => p.limits.scheduledPosts.toLocaleString("en-US")],
    ["Category engines", (p) => (p.limits.engines.length >= 5 ? "All five" : enginesText(p.limits.engines).replace(/ engines$/, ""))],
    ["Hooks and captions per network", (p) => (p.limits.captions ? "Yes" : "No")],
    ["Posting", (p) => (p.limits.posting ? "Yes" : "No")],
    ["Scheduling", (p) => (p.limits.scheduling ? "Yes" : "No")],
    ["Analytics per post", (p) => (p.limits.postAnalytics ? "Yes" : "No")],
  ];

  return (
    <>
      <PageHero eyebrow="Pricing" title="Only pay for the minutes you actually clip" body={`1 credit is 1 minute of video the AI analyses. Every account starts with ${TRIAL.credits} free credits and no card. Posting never costs credits.`} />

      <Section border={false} className="!pt-0">
        <div className="-mt-6">
          <PlanGrid />
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Find your plan" title="How much video do you clip" />
        <div className="mt-12">
          <CreditCalculator />
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Compare" title="Every plan, side by side" />
        <div className="mt-12 overflow-x-auto rounded-[24px] border border-line">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2/60">
                <th className="hud px-6 py-4 font-normal text-muted">Included</th>
                {PLANS.map((p) => (
                  <th key={p.id} className="px-6 py-4">
                    <span className="block text-[22px] font-normal tracking-[-0.02em]">{p.name}</span>
                    <span className="hud text-muted">${p.price} / month</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="px-6 py-4 text-[16px] text-muted">{label}</td>
                  {PLANS.map((p) => (
                    <td key={p.id} className={`px-6 py-4 text-[16px] ${p.highlight ? "text-text" : "text-text/85"}`}>
                      {get(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.3fr]">
          <SectionHead eyebrow="Billing questions" title="Credits and billing" />
          <FaqList items={FAQ_GROUPS.find((g) => g.id === "billing")!.items} />
        </div>
      </Section>

      <FinalCta title="Cheaper than an editor" accent="Your wallet says thanks" button="Pick my plan" />
    </>
  );
}
