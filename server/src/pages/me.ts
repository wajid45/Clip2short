import { isAdmin, requireUser } from "@server/lib/auth";
import { ensureTrial, getCredits } from "@server/lib/credits";
import { getPlan, hasActiveSubscription } from "@shortlark/shared/plans";

/** Signed-in user summary for the app shell (sidebar, credits card). 401 when signed out. */
export async function loadMe() {
  const user = await requireUser();
  if (!user.trialStartedAt) await ensureTrial(user.id); // accounts created before credits existed
  const plan = hasActiveSubscription(user) ? getPlan(user.plan) : null;
  const credits = await getCredits(user.id);
  return {
    name: user.name ?? user.email.split("@")[0],
    email: user.email,
    planName: plan?.name ?? null,
    credits: credits.total,
    monthlyCredits: plan?.monthlyCredits ?? null,
    isAdmin: isAdmin(user),
  };
}
