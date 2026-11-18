"""Billing: plan checkout, credit packs, the customer portal, dev activation and the Stripe webhook."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..auth import require_user
from ..billing import ensure_customer, first_price_id, plan_for_price, price_for_plan, stripe_client, sync_subscription
from ..config import billing_configured, dev_billing_bypass, settings
from ..credits import grant_pack_credits, grant_plan_credits
from ..db import SessionLocal, get_db, utcnow
from ..http import HttpError, json_response, validate
from ..models import ProcessedWebhook, User
from ..plans import get_pack, get_plan, has_active_subscription
from .common import JsonBody, Model, api_router

log = logging.getLogger("shortlark.billing")
router = api_router()


class Checkout(Model):
    plan: Literal["creator", "pro", "studio"]


class BuyPack(Model):
    pack: Literal["pack-100", "pack-500", "pack-2000"]


class DevActivate(Model):
    plan: Literal["creator", "pro", "studio", "none"]


@router.post("/billing/checkout")
def checkout(body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    plan = validate(Checkout, body).plan
    if not billing_configured():
        raise HttpError(503, "Billing isn't configured yet.")
    # Existing subscribers change plans in the customer portal (handles proration).
    if has_active_subscription(user):
        raise HttpError(409, "You already have a subscription. Use Manage billing to change plans.")
    session = stripe_client().v1.checkout.sessions.create(
        params={
            "mode": "subscription",
            "customer": ensure_customer(s, user),
            "line_items": [{"price": price_for_plan(plan) or "", "quantity": 1}],
            "allow_promotion_codes": True,
            "billing_address_collection": "auto",
            "client_reference_id": user.id,
            "subscription_data": {"metadata": {"userId": user.id, "plan": plan}},
            "success_url": f"{settings.app_url}/app/billing?success=1",
            "cancel_url": f"{settings.app_url}/app/billing?canceled=1",
        }
    )
    return json_response({"url": session.url})


@router.post("/billing/credits")
def buy_pack(body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Buys a one-off credit pack: Stripe Checkout in payment mode (or an instant grant in local dev)."""
    pack = get_pack(validate(BuyPack, body).pack)
    assert pack is not None
    if dev_billing_bypass():
        grant_pack_credits(s, user.id, pack, f"dev-pack:{user.id}:{int(utcnow().timestamp() * 1000)}")
        return json_response({"url": "/app/billing?credits=1"})
    if not settings.stripe_secret:
        raise HttpError(503, "Billing isn't configured yet.")
    meta = {"kind": "credit_pack", "userId": user.id, "pack": pack["id"]}
    session = stripe_client().v1.checkout.sessions.create(
        params={
            "mode": "payment",
            "customer": ensure_customer(s, user),
            "client_reference_id": user.id,
            "line_items": [
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": pack["price"] * 100,
                        "product_data": {"name": f"Shortlark credits: {pack['credits']:,}", "description": "One-off credit pack. Never expires."},
                    },
                }
            ],
            "metadata": meta,
            "payment_intent_data": {"metadata": meta},
            "success_url": f"{settings.app_url}/app/billing?credits=1",
            "cancel_url": f"{settings.app_url}/app/billing?canceled=1",
        }
    )
    return json_response({"url": session.url})


@router.post("/billing/portal")
def portal(user: User = Depends(require_user)):
    if not billing_configured():
        raise HttpError(503, "Billing isn't configured yet.")
    if not user.stripeCustomerId:
        raise HttpError(400, "You don't have a billing account yet. Choose a plan first.")
    session = stripe_client().v1.billing_portal.sessions.create(params={"customer": user.stripeCustomerId, "return_url": f"{settings.app_url}/app/billing"})
    return json_response({"url": session.url})


@router.post("/billing/dev-activate")
def dev_activate(request: Request, body: JsonBody = None, s: Session = Depends(get_db)):
    """Local development only: activates a plan without Stripe. Disabled in production and whenever Stripe is configured."""
    if not dev_billing_bypass():
        raise HttpError(404, "Not found")
    user = require_user(request, s)
    plan = validate(DevActivate, body).plan
    period_end = utcnow() + timedelta(days=30)
    if plan == "none":
        user.plan, user.subscriptionStatus, user.currentPeriodEnd = "none", "canceled", None
    else:
        user.plan, user.subscriptionStatus, user.currentPeriodEnd, user.cancelAtPeriodEnd = plan, "active", period_end, False
    s.commit()
    p = get_plan(plan)
    if p:
        grant_plan_credits(s, user.id, p, period_end, f"dev-plan:{user.id}:{int(utcnow().timestamp() * 1000)}")
    return json_response({"ok": True})


# ── Webhook ──────────────────────────────────────────────────────────────────


def _handle_event(event: Any) -> None:
    client = stripe_client()
    with SessionLocal() as s:
        if s.get(ProcessedWebhook, event.id):
            return  # Stripe retries deliveries
        etype = event.type
        obj = event.data.object
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            if obj.get("mode") == "payment" and meta.get("kind") == "credit_pack" and obj.get("payment_status") == "paid":
                pack = get_pack(meta.get("pack"))
                if pack and meta.get("userId"):
                    grant_pack_credits(s, meta["userId"], pack, f"pack:{obj['id']}")
            if obj.get("mode") == "subscription" and obj.get("subscription"):
                sub_ref = obj["subscription"]
                sub_id = sub_ref if isinstance(sub_ref, str) else sub_ref["id"]
                if obj.get("client_reference_id") and obj.get("customer"):
                    cust = obj["customer"]
                    customer_id = cust if isinstance(cust, str) else cust["id"]
                    s.execute(update(User).where(User.id == obj["client_reference_id"]).values(stripeCustomerId=customer_id))
                    s.commit()
                sync_subscription(s, client.v1.subscriptions.retrieve(sub_id))
        elif etype in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "customer.subscription.paused",
            "customer.subscription.resumed",
        ):
            sync_subscription(s, obj)
        elif etype in ("invoice.paid", "invoice.payment_failed"):
            parent = obj.get("parent") or {}
            sub_ref = (parent.get("subscription_details") or {}).get("subscription") or obj.get("subscription")
            sub_id = sub_ref if isinstance(sub_ref, str) else (sub_ref or {}).get("id")
            if sub_id:
                sub = client.v1.subscriptions.retrieve(sub_id)
                sync_subscription(s, sub)
                # Monthly credits: granted when a new period is paid for (first invoice and each renewal).
                if etype == "invoice.paid" and obj.get("billing_reason") in ("subscription_create", "subscription_cycle"):
                    plan = get_plan(plan_for_price(first_price_id(sub)))
                    cust = sub["customer"]
                    customer_id = cust if isinstance(cust, str) else cust["id"]
                    user = s.scalar(select(User).where(User.stripeCustomerId == customer_id))
                    lines = (obj.get("lines") or {}).get("data") or []
                    end = (lines[0].get("period") or {}).get("end") if lines else None
                    if plan and user and end:
                        grant_plan_credits(s, user.id, plan, datetime.fromtimestamp(end, UTC), f"invoice:{obj['id']}")
        s.add(ProcessedWebhook(id=event.id))
        s.commit()


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not settings.stripe_secret or not settings.stripe_webhook_secret:
        return Response("Billing not configured", status_code=503)
    raw = await request.body()
    try:
        event = stripe_client().construct_event(raw, request.headers.get("stripe-signature", ""), settings.stripe_webhook_secret)
    except Exception as e:
        return Response(f"Invalid signature: {e}", status_code=400)
    try:
        await run_in_threadpool(_handle_event, event)
    except Exception:
        log.exception("webhook handling failed: %s", event.type)
        return Response("Handler error", status_code=500)  # Stripe will retry
    return Response("ok")
