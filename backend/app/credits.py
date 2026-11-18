"""Credit ledger.

Balance = the sum of `remaining` on unexpired grants. Spending draws from the grant that
expires soonest (plan credits before packs), using conditional updates so two concurrent
spends can never overdraw a grant.
"""

from __future__ import annotations

import json
import threading
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import utcnow
from .models import CreditGrant, CreditTransaction, User
from .plans import TRIAL


class InsufficientCredits(Exception):
    def __init__(self, needed: int, available: int):
        super().__init__(f"Not enough credits: this needs {needed} and you have {available}.")
        self.needed = needed
        self.available = available


@dataclass
class Bucket:
    source: str
    remaining: int
    expiresAt: datetime | None


@dataclass
class CreditSummary:
    total: int
    buckets: list[Bucket]


def _live(user_id: str, now: datetime):
    return (
        CreditGrant.userId == user_id,
        CreditGrant.remaining > 0,
        or_(CreditGrant.expiresAt.is_(None), CreditGrant.expiresAt > now),
    )


def _soonest_first():
    # Soonest expiry first, never-expiring last, then oldest first.
    return (CreditGrant.expiresAt.is_(None), CreditGrant.expiresAt.asc(), CreditGrant.createdAt.asc())


def credit_summary(s: Session, user_id: str) -> CreditSummary:
    rows = s.execute(
        select(CreditGrant.source, CreditGrant.remaining, CreditGrant.expiresAt).where(*_live(user_id, utcnow())).order_by(*_soonest_first())
    ).all()
    buckets = [Bucket(r.source, r.remaining, r.expiresAt) for r in rows]
    return CreditSummary(sum(b.remaining for b in buckets), buckets)


def by_source(summary: CreditSummary) -> dict[str, dict[str, Any]]:
    """Live grants grouped by source (earliest expiry wins)."""
    out: dict[str, dict[str, Any]] = {}
    for b in summary.buckets:
        cur = out.get(b.source)
        if cur is None:
            out[b.source] = {"remaining": b.remaining, "expiresAt": b.expiresAt}
            continue
        exp = cur["expiresAt"]
        cur["remaining"] += b.remaining
        cur["expiresAt"] = min(exp, b.expiresAt) if exp and b.expiresAt else (exp or b.expiresAt)
    return out


def grant_credits(s: Session, *, user_id: str, source: str, amount: int, expires_at: datetime | None, description: str, ref: str | None = None) -> bool:
    """Adds credits. Returns False when this `ref` was already granted (e.g. a retried webhook)."""
    if ref and s.scalar(select(CreditGrant.id).where(CreditGrant.ref == ref)):
        return False
    try:
        s.add(CreditGrant(userId=user_id, source=source, amount=amount, remaining=amount, expiresAt=expires_at, ref=ref))
        s.add(CreditTransaction(userId=user_id, delta=amount, kind="grant", description=description))
        s.commit()
        return True
    except IntegrityError:
        s.rollback()  # a concurrent duplicate on `ref`: already granted
        return False


def ensure_trial(s: Session, user_id: str) -> None:
    """Gives the free trial once per account."""
    claimed = s.execute(update(User).where(User.id == user_id, User.trialStartedAt.is_(None)).values(trialStartedAt=utcnow())).rowcount
    s.commit()
    if not claimed:
        return
    grant_credits(
        s,
        user_id=user_id,
        source="trial",
        amount=TRIAL["credits"],
        expires_at=utcnow() + timedelta(days=TRIAL["days"]),
        ref=f"trial:{user_id}",
        description=f"Free trial: {TRIAL['credits']} credits for {TRIAL['days']} days",
    )


def grant_plan_credits(s: Session, user_id: str, plan: dict[str, Any], period_end: datetime, ref: str) -> bool:
    return grant_credits(
        s,
        user_id=user_id,
        source="plan",
        amount=plan["monthlyCredits"],
        expires_at=period_end,
        ref=ref,
        description=f"{plan['name']} plan: {plan['monthlyCredits']:,} monthly credits",
    )


def grant_pack_credits(s: Session, user_id: str, pack: dict[str, Any], ref: str) -> bool:
    return grant_credits(
        s,
        user_id=user_id,
        source="pack",
        amount=pack["credits"],
        expires_at=None,
        ref=ref,
        description=f"Credit pack: {pack['credits']:,} credits",
    )


# Serialises spends per user inside this process (avoids lock contention on SQLite).
_user_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


def _user_lock(user_id: str) -> threading.Lock:
    with _locks_guard:
        return _user_locks[user_id]


def spend_credits(s: Session, user_id: str, amount: int, description: str, video_id: str | None = None) -> str:
    """Spends credits and returns the transaction id (needed to refund). Raises InsufficientCredits.

    Each grant is decremented with a conditional update (`remaining >= take`), so even across
    several servers a grant can never go negative; if one step loses a race, the steps already
    applied are put back and the spend is re-planned.
    """
    with _user_lock(user_id):
        for _ in range(5):
            grants = s.execute(select(CreditGrant.id, CreditGrant.remaining).where(*_live(user_id, utcnow())).order_by(*_soonest_first())).all()
            available = sum(g.remaining for g in grants)
            if available < amount:
                raise InsufficientCredits(amount, available)

            alloc: list[dict[str, Any]] = []
            left = amount
            for g in grants:
                if not left:
                    break
                take = min(left, g.remaining)
                alloc.append({"grantId": g.id, "amount": take})
                left -= take

            applied: list[dict[str, Any]] = []
            lost = False
            for a in alloc:
                n = s.execute(
                    update(CreditGrant)
                    .where(CreditGrant.id == a["grantId"], CreditGrant.remaining >= a["amount"])
                    .values(remaining=CreditGrant.remaining - a["amount"])
                ).rowcount
                s.commit()
                if n != 1:
                    lost = True
                    break
                applied.append(a)
            if lost:
                _put_back(s, applied)
                continue  # another server spent from the same grant: re-plan
            try:
                t = CreditTransaction(userId=user_id, delta=-amount, kind="spend", description=description, videoId=video_id, allocJson=json.dumps(alloc))
                s.add(t)
                s.commit()
                return t.id
            except Exception:
                s.rollback()
                _put_back(s, applied)
                raise
        raise RuntimeError("Couldn't reserve credits. Please try again.")


def _put_back(s: Session, applied: list[dict[str, Any]]) -> None:
    for a in applied:
        s.execute(update(CreditGrant).where(CreditGrant.id == a["grantId"]).values(remaining=CreditGrant.remaining + a["amount"]))
    s.commit()


def refund_credits(s: Session, transaction_id: str, reason: str) -> None:
    """Returns a spend's credits to the grants they came from. Safe to call twice."""
    t = s.get(CreditTransaction, transaction_id)
    if not t or t.kind != "spend" or t.refundedAt:
        return
    claimed = s.execute(
        update(CreditTransaction).where(CreditTransaction.id == t.id, CreditTransaction.refundedAt.is_(None)).values(refundedAt=utcnow())
    ).rowcount
    s.commit()
    if not claimed:
        return
    for a in json.loads(t.allocJson or "[]"):
        s.execute(update(CreditGrant).where(CreditGrant.id == a["grantId"]).values(remaining=CreditGrant.remaining + a["amount"]))
    s.add(CreditTransaction(userId=t.userId, delta=-t.delta, kind="refund", description=reason, videoId=t.videoId))
    s.commit()
