import { z } from "zod";
import { apiUser, handle, HttpError, json, parseBody } from "@server/lib/api";
import { ensureCustomer, priceForPlan, stripe } from "@server/lib/billing";
import { billingConfigured, env } from "@server/lib/env";
import { hasActiveSubscription } from "@shortlark/shared/plans";

const Body = z.object({ plan: z.enum(["creator", "pro", "studio"]) });

export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const { plan } = await parseBody(req, Body);
  if (!billingConfigured()) throw new HttpError(503, "Billing isn't configured yet.");
  // Existing subscribers change plans in the customer portal (handles proration).
  if (hasActiveSubscription(user)) throw new HttpError(409, "You already have a subscription. Use Manage billing to change plans.");
  const price = priceForPlan(plan)!;
  const customer = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id, plan } },
    success_url: `${env.appUrl}/app/billing?success=1`,
    cancel_url: `${env.appUrl}/app/billing?canceled=1`,
  });
  return json({ url: session.url });
});
