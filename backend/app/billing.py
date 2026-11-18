"""Stripe: customers, plan ↔ price mapping and subscription sync."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import stripe
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import User

log = logging.getLogger("shortlark.billing")


def stripe_client() -> stripe.StripeClient:
    if not settings.stripe_secret:
        raise RuntimeError("Stripe is not configured (STRIPE_SECRET_KEY).")
    return stripe.StripeClient(settings.stripe_secret)


def price_for_plan(plan: str) -> str | None:
    return settings.stripe_prices.get(plan)


def plan_for_price(price_id: str | None) -> str | None:
    if not price_id:
        return None
    return next((plan for plan, price in settings.stripe_prices.items() if price == price_id), None)


def ensure_customer(s: Session, user: User) -> str:
    if user.stripeCustomerId:
        return user.stripeCustomerId
    customer = stripe_client().v1.customers.create(params={"email": user.email, **({"name": user.name} if user.name else {}), "metadata": {"userId": user.id}})
    user.stripeCustomerId = customer.id
    s.commit()
    return customer.id


def _get(obj: Any, key: str, default: Any = None) -> Any:
    try:
        return obj[key] if key in obj else default
    except TypeError:
        return getattr(obj, key, default)


def _period_end(sub: Any) -> datetime | None:
    """Period end lives on subscription items in newer Stripe API versions, on the subscription in older ones."""
    items = _get(_get(sub, "items") or {}, "data") or []
    ts = (_get(items[0], "current_period_end") if items else None) or _get(sub, "current_period_end")
    return datetime.fromtimestamp(ts, UTC) if ts else None


def _id_of(ref: Any) -> str | None:
    if ref is None:
        return None
    return ref if isinstance(ref, str) else _get(ref, "id")


def first_price_id(sub: Any) -> str | None:
    items = _get(_get(sub, "items") or {}, "data") or []
    return _get(_get(items[0], "price") or {}, "id") if items else None


def sync_subscription(s: Session, sub: Any) -> None:
    """Mirrors a Stripe subscription onto the user. Source of truth for access."""
    customer_id = _id_of(_get(sub, "customer"))
    user = s.scalar(select(User).where(User.stripeCustomerId == customer_id)) if customer_id else None
    if not user:
        uid = (_get(sub, "metadata") or {}).get("userId")
        user = s.get(User, uid) if uid else None
    if not user:
        log.warning("subscription for unknown customer %s", customer_id)
        return
    status = _get(sub, "status")
    ended = status in ("canceled", "incomplete_expired")
    plan = plan_for_price(first_price_id(sub))
    user.stripeCustomerId = customer_id
    user.stripeSubscriptionId = None if ended else _get(sub, "id")
    user.plan = "none" if ended else (plan or user.plan)
    user.subscriptionStatus = "canceled" if status == "incomplete_expired" else status
    user.currentPeriodEnd = _period_end(sub)
    user.cancelAtPeriodEnd = bool(_get(sub, "cancel_at_period_end"))
    s.commit()
