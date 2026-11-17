import { z } from "zod";
import { apiUser, handle, HttpError, json, parseBody } from "@/lib/api";
import { ensureCustomer, stripe } from "@/lib/billing";
import { devBillingBypass, env } from "@/lib/env";
import { CREDIT_PACKS, getPack } from "@/lib/plans";
import { grantPackCredits } from "@/lib/credits";

const Body = z.object({ pack: z.enum(CREDIT_PACKS.map((p) => p.id) as [string, ...string[]]) });

/** Buys a one-off credit pack: Stripe Checkout in payment mode (or an instant grant in local dev without Stripe). */
export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const pack = getPack((await parseBody(req, Body)).pack)!;

  if (devBillingBypass()) {
    await grantPackCredits(user.id, pack, `dev-pack:${user.id}:${Date.now()}`);
    return json({ url: "/app/billing?credits=1" });
  }
  if (!env.stripeSecret) throw new HttpError(503, "Billing isn't configured yet.");

  const customer = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.price * 100,
          product_data: { name: `Shortlark credits: ${pack.credits.toLocaleString("en-US")}`, description: "One-off credit pack. Never expires." },
        },
      },
    ],
    metadata: { kind: "credit_pack", userId: user.id, pack: pack.id },
    payment_intent_data: { metadata: { kind: "credit_pack", userId: user.id, pack: pack.id } },
    success_url: `${env.appUrl}/app/billing?credits=1`,
    cancel_url: `${env.appUrl}/app/billing?canceled=1`,
  });
  return json({ url: session.url });
});
