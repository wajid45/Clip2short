import type Stripe from "stripe";
import { db } from "@server/lib/db";
import { env } from "@server/lib/env";
import { planForPrice, stripe, syncSubscription } from "@server/lib/billing";
import { getPack, getPlan } from "@shortlark/shared/plans";
import { grantPackCredits, grantPlanCredits } from "@server/lib/credits";


export async function POST(req: Request) {
  if (!env.stripeSecret || !env.stripeWebhookSecret) return new Response("Billing not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig ?? "", env.stripeWebhookSecret);
  } catch (e) {
    return new Response(`Invalid signature: ${(e as Error).message}`, { status: 400 });
  }

  // Idempotency: Stripe retries deliveries.
  const seen = await db.processedWebhook.findUnique({ where: { id: event.id } });
  if (seen) return new Response("ok");

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "payment" && s.metadata?.kind === "credit_pack" && s.payment_status === "paid") {
          const pack = getPack(s.metadata.pack);
          if (pack && s.metadata.userId) await grantPackCredits(s.metadata.userId, pack, `pack:${s.id}`);
        }
        if (s.mode === "subscription" && s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          if (s.client_reference_id && s.customer) {
            const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
            await db.user.updateMany({ where: { id: s.client_reference_id }, data: { stripeCustomerId: customerId } });
          }
          await syncSubscription(await stripe().subscriptions.retrieve(subId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        const subRef = inv.parent?.subscription_details?.subscription ?? inv.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) break;
        const sub = await stripe().subscriptions.retrieve(subId);
        await syncSubscription(sub);
        // Monthly credits: granted when a new period is paid for (first invoice and each renewal).
        if (event.type === "invoice.paid" && (inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle")) {
          const plan = getPlan(planForPrice(sub.items.data[0]?.price?.id));
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const user = await db.user.findUnique({ where: { stripeCustomerId: customerId } });
          const end = inv.lines.data[0]?.period?.end;
          if (plan && user && end) await grantPlanCredits(user.id, plan, new Date(end * 1000), `invoice:${inv.id}`);
        }
        break;
      }
    }
    await db.processedWebhook.create({ data: { id: event.id } });
  } catch (e) {
    console.error("[stripe] webhook handling failed", event.type, e);
    return new Response("Handler error", { status: 500 }); // Stripe will retry
  }
  return new Response("ok");
}
