import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, handle, HttpError, json, parseBody } from "@/lib/api";
import { devBillingBypass } from "@/lib/env";
import { getPlan } from "@/lib/plans";
import { grantPlanCredits } from "@/lib/credits";

/** Local development only: activates a plan without Stripe. Disabled in production and whenever Stripe is configured. */
const Body = z.object({ plan: z.enum(["creator", "pro", "studio", "none"]) });

export const POST = handle(async (req: Request) => {
  if (!devBillingBypass()) throw new HttpError(404, "Not found");
  const user = await apiUser();
  const { plan } = await parseBody(req, Body);
  await db.user.update({
    where: { id: user.id },
    data:
      plan === "none"
        ? { plan: "none", subscriptionStatus: "canceled", currentPeriodEnd: null }
        : { plan, subscriptionStatus: "active", currentPeriodEnd: new Date(Date.now() + 30 * 864e5), cancelAtPeriodEnd: false },
  });
  const p = getPlan(plan);
  if (p) await grantPlanCredits(user.id, p, new Date(Date.now() + 30 * 864e5), `dev-plan:${user.id}:${Date.now()}`);
  return json({ ok: true });
});
