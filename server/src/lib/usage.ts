import { db } from "./db";
import { hasActiveSubscription, limitsFor } from "@shortlark/shared/plans";
import { HttpError } from "./api";
import { getCredits } from "./credits";
import type { CurrentUser } from "./auth";

/** Workspace access: an active plan, or any unexpired credits (trial or packs). */
export async function hasAccess(user: CurrentUser): Promise<boolean> {
  if (hasActiveSubscription(user)) return true;
  return (await getCredits(user.id)).total > 0;
}

export async function assertCanConnectAccount(user: CurrentUser) {
  const limits = limitsFor(user);
  const n = await db.socialAccount.count({ where: { userId: user.id, platform: { not: "sandbox" } } });
  if (n >= limits.socialAccounts)
    throw new HttpError(
      402,
      `You can connect up to ${limits.socialAccounts} accounts${hasActiveSubscription(user) ? " on your plan" : " without a plan"}. Upgrade for more.`,
      "limit_reached",
    );
}

export async function assertCanQueuePosts(user: CurrentUser, adding: number) {
  const limits = limitsFor(user);
  const n = await db.post.count({ where: { userId: user.id, status: { in: ["queued", "scheduled"] } } });
  if (n + adding > limits.scheduledPosts)
    throw new HttpError(402, `Your queue holds up to ${limits.scheduledPosts} posts (you have ${n}). Upgrade for more.`, "limit_reached");
}
