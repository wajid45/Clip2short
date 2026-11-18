import { requestCache } from "../http/context";
import { db } from "./db";
import { TRIAL, type Plan, type CreditPack } from "@shortlark/shared/plans";

/**
 * Credit balance = the sum of `remaining` on unexpired grants.
 * Spending draws from the grant that expires soonest (plan credits before packs),
 * using conditional updates so two concurrent spends can never overdraw a grant.
 */

export class InsufficientCredits extends Error {
  constructor(public needed: number, public available: number) {
    super(`Not enough credits: this needs ${needed} and you have ${available}.`);
  }
}

const live = (now = new Date()) => ({ remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export interface CreditSummary {
  total: number;
  buckets: { source: string; remaining: number; expiresAt: Date | null }[];
}

export async function creditSummary(userId: string): Promise<CreditSummary> {
  const grants = await db.creditGrant.findMany({
    where: { userId, ...live() },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { source: true, remaining: true, expiresAt: true },
  });
  return { total: grants.reduce((n, g) => n + g.remaining, 0), buckets: grants };
}

/** Per-request cached balance for layouts and pages. */
export const getCredits = (userId: string) => requestCache(`credits:${userId}`, () => creditSummary(userId));

export async function grantCredits(opts: {
  userId: string;
  source: "trial" | "plan" | "pack" | "admin";
  amount: number;
  expiresAt: Date | null;
  ref?: string;
  description: string;
}): Promise<boolean> {
  if (opts.ref && (await db.creditGrant.findUnique({ where: { ref: opts.ref } }))) return false; // already granted
  try {
    await db.$transaction([
      db.creditGrant.create({
        data: {
          userId: opts.userId,
          source: opts.source,
          amount: opts.amount,
          remaining: opts.amount,
          expiresAt: opts.expiresAt,
          ref: opts.ref,
        },
      }),
      db.creditTransaction.create({
        data: { userId: opts.userId, delta: opts.amount, kind: "grant", description: opts.description },
      }),
    ]);
    return true;
  } catch (e) {
    // Unique violation on `ref` = a concurrent duplicate (e.g. a retried webhook): already granted.
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

/** Gives the free trial once per account. */
export async function ensureTrial(userId: string) {
  const claimed = await db.user.updateMany({ where: { id: userId, trialStartedAt: null }, data: { trialStartedAt: new Date() } });
  if (!claimed.count) return;
  await grantCredits({
    userId,
    source: "trial",
    amount: TRIAL.credits,
    expiresAt: new Date(Date.now() + TRIAL.days * 864e5),
    ref: `trial:${userId}`,
    description: `Free trial: ${TRIAL.credits} credits for ${TRIAL.days} days`,
  });
}

export async function grantPlanCredits(userId: string, plan: Plan, periodEnd: Date, ref: string) {
  return grantCredits({
    userId,
    source: "plan",
    amount: plan.monthlyCredits,
    expiresAt: periodEnd,
    ref,
    description: `${plan.name} plan: ${plan.monthlyCredits.toLocaleString("en-US")} monthly credits`,
  });
}

export async function grantPackCredits(userId: string, pack: CreditPack, ref: string) {
  return grantCredits({
    userId,
    source: "pack",
    amount: pack.credits,
    expiresAt: null,
    ref,
    description: `Credit pack: ${pack.credits.toLocaleString("en-US")} credits`,
  });
}

/** Serialises credit spends per user inside this server process (avoids lock contention on SQLite). */
const userLocks = new Map<string, Promise<unknown>>();
function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = userLocks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.catch(() => {});
  userLocks.set(userId, settled);
  void settled.then(() => {
    if (userLocks.get(userId) === settled) userLocks.delete(userId);
  });
  return run;
}

/**
 * Spends credits. Returns the transaction id (needed to refund). Throws InsufficientCredits.
 * Each grant is decremented with a conditional update (`remaining >= take`), so even across
 * several servers a grant can never go negative; if one step loses a race, the steps already
 * applied are put back and the spend is re-planned.
 */
export function spendCredits(userId: string, amount: number, description: string, videoId?: string): Promise<string> {
  return withUserLock(userId, async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const grants = await db.creditGrant.findMany({
        where: { userId, ...live() },
        orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        select: { id: true, remaining: true },
      });
      const available = grants.reduce((n, g) => n + g.remaining, 0);
      if (available < amount) throw new InsufficientCredits(amount, available);

      const alloc: { grantId: string; amount: number }[] = [];
      let left = amount;
      for (const g of grants) {
        if (!left) break;
        const take = Math.min(left, g.remaining);
        alloc.push({ grantId: g.id, amount: take });
        left -= take;
      }

      const applied: typeof alloc = [];
      let lost = false;
      for (const a of alloc) {
        const r = await db.creditGrant.updateMany({
          where: { id: a.grantId, remaining: { gte: a.amount } },
          data: { remaining: { decrement: a.amount } },
        });
        if (r.count !== 1) {
          lost = true;
          break;
        }
        applied.push(a);
      }
      if (lost) {
        for (const a of applied) await db.creditGrant.update({ where: { id: a.grantId }, data: { remaining: { increment: a.amount } } });
        continue; // another server spent from the same grant: re-plan
      }
      try {
        const t = await db.creditTransaction.create({
          data: { userId, delta: -amount, kind: "spend", description, videoId, allocJson: JSON.stringify(alloc) },
        });
        return t.id;
      } catch (e) {
        for (const a of applied) await db.creditGrant.update({ where: { id: a.grantId }, data: { remaining: { increment: a.amount } } });
        throw e;
      }
    }
    throw new Error("Couldn't reserve credits. Please try again.");
  });
}

/** Returns a spend's credits to the grants they came from. Safe to call twice. */
export async function refundCredits(transactionId: string, reason: string) {
  const t = await db.creditTransaction.findUnique({ where: { id: transactionId } });
  if (!t || t.kind !== "spend" || t.refundedAt) return;
  const claimed = await db.creditTransaction.updateMany({ where: { id: t.id, refundedAt: null }, data: { refundedAt: new Date() } });
  if (!claimed.count) return;
  const alloc = JSON.parse(t.allocJson ?? "[]") as { grantId: string; amount: number }[];
  await db.$transaction([
    ...alloc.map((a) => db.creditGrant.update({ where: { id: a.grantId }, data: { remaining: { increment: a.amount } } })),
    db.creditTransaction.create({
      data: { userId: t.userId, delta: -t.delta, kind: "refund", description: reason, videoId: t.videoId },
    }),
  ]);
}
