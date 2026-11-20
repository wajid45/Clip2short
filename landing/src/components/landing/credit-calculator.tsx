import clsx from "clsx";
import { useState } from "react";
import { PLANS } from "@shortlark/shared/plans";

const fmt = (n: number) => n.toLocaleString("en-US");
const hoursOf = (credits: number) => Math.round((credits / 60) * 10) / 10;

/**
 * "How much video do you clip?" Slide to your monthly hours and the smallest plan that covers
 * them is recommended (1 credit = 1 minute). Past the biggest plan, Studio plus a note to talk to us.
 */
export function CreditCalculator() {
  const [hours, setHours] = useState(6);
  const minutes = hours * 60;
  const fits = PLANS.find((p) => p.monthlyCredits >= minutes);
  const plan = fits ?? PLANS[PLANS.length - 1];
  const spare = plan.monthlyCredits - minutes;
  const max = 30;

  return (
    <div className="grid gap-10 rounded-[32px] border border-line bg-surface p-7 sm:p-10 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:p-12">
      <div>
        <p className="hud text-muted">
          <span className="text-signal">/</span> Find your plan
        </p>
        <p className="mt-4 text-[clamp(23px,2.16vw,31px)] leading-tight tracking-[-0.02em]">How much video do you clip a month?</p>
        <p className="mt-8 flex items-baseline gap-3">
          <span className="text-[clamp(58px,5.4vw,79px)] leading-none tracking-[-0.04em] tabular-nums">{hours}</span>
          <span className="text-[20px] text-muted">hour{hours === 1 ? "" : "s"}</span>
        </p>
        <input
          type="range"
          min={1}
          max={max}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          aria-label="Hours of video per month"
          className="range mt-8 w-full"
          style={{ ["--fill" as string]: `${((hours - 1) / (max - 1)) * 100}%` }}
        />
        <div className="hud mt-3 flex justify-between text-faint">
          <span>1 h</span>
          <span>15 h</span>
          <span>30 h</span>
        </div>
        <p className="mt-6 text-[16px] text-muted">
          That is <span className="text-text tabular-nums">{fmt(minutes)}</span> credits a month. 1 credit is 1 minute of video.
        </p>
      </div>

      <div className="rounded-[24px] bg-[#0d0e12] p-7 text-white sm:p-8">
        <p className="hud text-white/55">Recommended for you</p>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <p className="text-[31px] leading-none tracking-[-0.02em]">{plan.name}</p>
          <p className="flex items-baseline gap-1">
            <span className="text-[31px] leading-none tracking-[-0.03em]">${plan.price}</span>
            <span className="hud text-white/55">/ mo</span>
          </p>
        </div>
        <p className="mt-3 text-[16px] text-white/65">
          {fits
            ? `${fmt(plan.monthlyCredits)} credits a month covers ${hoursOf(plan.monthlyCredits)} hours${spare > 0 ? `, with ${hoursOf(spare)} hours to spare` : ""}.`
            : `Our biggest plan covers ${hoursOf(plan.monthlyCredits)} hours a month. For more, talk to us about a custom plan.`}
        </p>

        {/* Where each plan tops out, with the visitor's hours marked */}
        <div className="mt-7 space-y-2.5" aria-hidden="true">
          {PLANS.map((p) => {
            const h = hoursOf(p.monthlyCredits);
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className={clsx("hud w-14", p.id === plan.id ? "text-white" : "text-white/40")}>{p.name}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className={clsx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", p.id === plan.id ? "bg-signal" : "bg-white/25")}
                    style={{ width: `${Math.min(100, (h / max) * 100)}%` }}
                  />
                </span>
                <span className={clsx("hud w-10 text-right", p.id === plan.id ? "text-white" : "text-white/40")}>{h}h</span>
              </div>
            );
          })}
        </div>

        <p className="mt-7 text-[14px] text-white/55">
          {fits ? (
            <>
              Choose <span className="text-white">{plan.name}</span> in the plans above.
            </>
          ) : (
            <a href="/contact" className="text-white underline underline-offset-4 hover:text-signal">
              Talk to us about a custom plan
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
