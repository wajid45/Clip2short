"""Pricing. The numbers live in shared/src/pricing.json, which the web app and landing page read too.

1 credit = 1 minute of source video analysed by the AI (rounded up, minimum 1).
Credits come from a free trial, a monthly plan (reset each billing period) or one-off packs (never expire).
"""

from __future__ import annotations

import json
import math
from typing import Any, Protocol

from .config import REPO_DIR

_PRICING: dict[str, Any] = json.loads((REPO_DIR / "shared" / "src" / "pricing.json").read_text(encoding="utf-8"))

PLANS: list[dict[str, Any]] = _PRICING["plans"]
CREDIT_PACKS: list[dict[str, Any]] = _PRICING["creditPacks"]
TRIAL: dict[str, int] = _PRICING["trial"]
BASE_LIMITS: dict[str, int] = _PRICING["baseLimits"]
ACTIVE_STATUSES = {"active", "trialing"}


class HasPlan(Protocol):
    plan: str
    subscriptionStatus: str


def get_plan(plan_id: str | None) -> dict[str, Any] | None:
    return next((p for p in PLANS if p["id"] == plan_id), None)


def get_pack(pack_id: str | None) -> dict[str, Any] | None:
    return next((p for p in CREDIT_PACKS if p["id"] == pack_id), None)


def has_active_subscription(u: HasPlan) -> bool:
    return u.subscriptionStatus in ACTIVE_STATUSES and get_plan(u.plan) is not None


def limits_for(u: HasPlan) -> dict[str, int]:
    plan = get_plan(u.plan)
    return plan["limits"] if has_active_subscription(u) and plan else BASE_LIMITS


def analysis_cost(duration_sec: float, rerun: bool) -> int:
    """Credits to analyse a video: 1 per minute, rounded up. Re-runs cost a quarter."""
    minutes = max(1, math.ceil(duration_sec / 60))
    return max(1, math.ceil(minutes / 4)) if rerun else minutes
