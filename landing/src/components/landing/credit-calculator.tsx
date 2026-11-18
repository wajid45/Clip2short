import clsx from "clsx";
import { appHref } from "../../config";
import { useEffect, useMemo, useState } from "react";
import { CREDIT_PACKS, PLANS } from "@shortlark/shared/plans";

/** Cheapest pack combination that covers `need` credits (small brute force; packs are few). */
function bestPacks(need: number) {
  const [a, b, c] = CREDIT_PACKS;
  let best = { cost: Infinity, credits: 0, combo: [0, 0, 0] };
  for (let z = 0; z <= Math.ceil(need / c.credits); z++)
    for (let y = 0; y <= 4; y++)
      for (let x = 0; x <= 5; x++) {
        const credits = x * a.credits + y * b.credits + z * c.credits;
        if (credits < need) continue;
        const cost = x * a.price + y * b.price + z * c.price;
        if (cost < best.cost || (cost === best.cost && credits > best.credits)) best = { cost, credits, combo: [x, y, z] };
      }
  return best;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Signed-in visitors are forwarded from the sign-up page straight to Billing with the same pick. */
export function CreditCalculator() {
  const [hours, setHours] = useState(8);
  const minutes = hours * 60;
  const { plan, packs } = useMemo(() => ({ plan: PLANS.find((p) => p.monthlyCredits >= minutes), packs: bestPacks(minutes) }), [minutes]);
  const best: "plan" | "packs" = plan && plan.price <= packs.cost ? "plan" : "packs";
  const [picked, setPicked] = useState<"plan" | "packs" | null>(null);
  useEffect(() => setPicked(null), [hours]); // a new amount resets to the recommendation
  const choice = picked ?? best;

  const base = appHref("/signup");
  const packList = CREDIT_PACKS.map((p, i) => ({ p, n: packs.combo[i] })).filter((x) => x.n > 0);
  const packsParam = packList.map(({ p, n }) => `${p.id}:${n}`).join(",");
  const packsLabel = packList.map(({ p, n }) => `${n > 1 ? `${n} × ` : ""}${fmt(p.credits)}`).join(" + ");

  const cta =
    choice === "plan" && plan
      ? { href: `${base}?plan=${plan.id}`, label: `Choose ${plan.name} · $${plan.price}/month` }
      : choice === "plan"
        ? { href: `${base}?plan=studio`, label: "Choose Studio · $129/month" }
        : { href: `${base}?packs=${packsParam}`, label: `Get ${packsLabel} credits · $${packs.cost}` };

  const option = (key: "plan" | "packs") =>
    clsx(
      "w-full rounded-2xl border p-5 text-left transition-colors",
      choice === key ? "border-signal bg-signal-soft" : "border-line hover:border-line-strong",
    );

  return (
    <div className="grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
      <div>
        <p className="text-sm font-medium text-text">How much video do you clip a month?</p>
        <p className="tc mt-3 text-5xl font-semibold tracking-tight">
          {hours} <span className="text-2xl text-muted">hour{hours === 1 ? "" : "s"}</span>
        </p>
        <input
          type="range"
          min={1}
          max={50}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          aria-label="Hours of video per month"
          className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--color-signal)]"
        />
        <div className="tc mt-2 flex justify-between text-xs text-faint">
          <span>1 h</span>
          <span>25 h</span>
          <span>50 h</span>
        </div>
        <p className="mt-4 text-sm text-muted">
          = <span className="tc text-text">{fmt(minutes)}</span> credits a month (1 credit = 1 minute of video).
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label="How to pay">
        <button type="button" role="radio" aria-checked={choice === "plan"} onClick={() => setPicked("plan")} className={option("plan")}>
          <p className="text-xs text-muted">{best === "plan" ? "Best value · monthly plan" : "Monthly plan"}</p>
          {plan ? (
            <>
              <p className="mt-1 text-xl font-semibold">
                {plan.name} · <span className="tc">${plan.price}</span>
                <span className="text-sm font-normal text-muted">/month</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {fmt(plan.monthlyCredits)} credits every month{plan.monthlyCredits > minutes ? ` · ${fmt(plan.monthlyCredits - minutes)} to spare` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">More than any plan includes: Studio plus top-up packs.</p>
          )}
        </button>
        <button type="button" role="radio" aria-checked={choice === "packs"} onClick={() => setPicked("packs")} className={option("packs")}>
          <p className="text-xs text-muted">{best === "packs" ? "Best value · credit packs" : "Credit packs · never expire"}</p>
          <p className="mt-1 text-xl font-semibold">
            <span className="tc">${packs.cost}</span> <span className="text-sm font-normal text-muted">one-off</span>
          </p>
          <p className="mt-1 text-sm text-muted">{packsLabel} credits</p>
        </button>
        <a href={cta.href} className="flex h-11 items-center justify-center rounded-lg bg-signal px-4 text-center text-[15px] font-medium text-white hover:bg-signal-strong">
          {cta.label}
        </a>
        <p className="text-center text-xs text-faint">Every account starts with 60 free credits.</p>
      </div>
    </div>
  );
}
