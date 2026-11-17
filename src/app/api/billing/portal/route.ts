import { apiUser, handle, HttpError, json } from "@/lib/api";
import { stripe } from "@/lib/billing";
import { billingConfigured, env } from "@/lib/env";

export const POST = handle(async () => {
  const user = await apiUser();
  if (!billingConfigured()) throw new HttpError(503, "Billing isn't configured yet.");
  if (!user.stripeCustomerId) throw new HttpError(400, "You don't have a billing account yet. Choose a plan first.");
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.appUrl}/app/billing`,
  });
  return json({ url: session.url });
});
