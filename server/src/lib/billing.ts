import Stripe from "stripe";
import { db } from "./db";
import { env } from "./env";
import type { PlanId } from "@shortlark/shared/plans";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.stripeSecret) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");
  stripeClient ??= new Stripe(env.stripeSecret, { appInfo: { name: "Shortlark" } });
  return stripeClient;
}

export function priceForPlan(plan: PlanId): string | undefined {
  return env.stripePrices[plan];
}

export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const [plan, price] of Object.entries(env.stripePrices)) if (price === priceId) return plan as PlanId;
  return null;
}

export async function ensureCustomer(user: { id: string; email: string; name: string | null; stripeCustomerId: string | null }) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });
  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Period end lives on subscription items in newer Stripe API versions, on the subscription in older ones. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  const legacy = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const ts = item?.current_period_end ?? legacy;
  return ts ? new Date(ts * 1000) : null;
}

/** Mirrors a Stripe subscription onto the user. Source of truth for access. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (await db.user.findUnique({ where: { stripeCustomerId: customerId } })) ??
    (sub.metadata?.userId ? await db.user.findUnique({ where: { id: sub.metadata.userId } }) : null);
  if (!user) {
    console.warn("[billing] subscription for unknown customer", customerId);
    return;
  }
  const plan = planForPrice(sub.items.data[0]?.price?.id);
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  await db.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: ended ? null : sub.id,
      plan: ended ? "none" : (plan ?? user.plan),
      subscriptionStatus: sub.status === "incomplete_expired" ? "canceled" : sub.status,
      currentPeriodEnd: periodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}
