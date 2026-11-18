import { requireUser } from "@server/lib/auth";
import { db } from "@server/lib/db";
import { getCredits } from "@server/lib/credits";
import { billingConfigured, devBillingBypass } from "@server/lib/env";
import { hasActiveSubscription } from "@shortlark/shared/plans";

/** Billing is reachable without credits (it's where you buy them), so it only needs a signed-in user. */
export async function loadBilling(q: URLSearchParams) {
  const user = await requireUser();
  const tab = q.get("tab") === "history" ? "history" : "plan";
  const credits = await getCredits(user.id);

  // Live grants grouped by source for the balance breakdown (earliest expiry wins).
  const bySource: Record<string, { remaining: number; expiresAt: Date | null }> = {};
  for (const b of credits.buckets) {
    const cur = bySource[b.source];
    bySource[b.source] = {
      remaining: (cur?.remaining ?? 0) + b.remaining,
      expiresAt: cur?.expiresAt && b.expiresAt ? (cur.expiresAt < b.expiresAt ? cur.expiresAt : b.expiresAt) : (cur?.expiresAt ?? b.expiresAt),
    };
  }

  let history = null;
  if (tab === "history") {
    const [rows, added, used, count] = await Promise.all([
      db.creditTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, delta: true, kind: true, description: true, createdAt: true, refundedAt: true },
      }),
      db.creditTransaction.aggregate({ where: { userId: user.id, kind: "grant" }, _sum: { delta: true } }),
      db.creditTransaction.aggregate({ where: { userId: user.id, kind: "spend", refundedAt: null }, _sum: { delta: true } }),
      db.creditTransaction.count({ where: { userId: user.id } }),
    ]);
    history = { rows, added: added._sum.delta ?? 0, used: Math.abs(used._sum.delta ?? 0), count };
  }

  return {
    tab,
    mode: billingConfigured() ? "stripe" : devBillingBypass() ? "dev" : "unavailable",
    active: hasActiveSubscription(user),
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    credits: { total: credits.total, bySource },
    history,
  } as const;
}
