from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest

from app.credits import InsufficientCredits, by_source, credit_summary, ensure_trial, grant_credits, refund_credits, spend_credits
from app.db import SessionLocal, utcnow
from app.models import CreditGrant, User
from app.security import hash_password


def make_user(db, email):
    u = User(email=email, passwordHash=hash_password("password123"))
    db.add(u)
    db.commit()
    return u


def test_trial_is_granted_once(db):
    u = make_user(db, "trial@test.dev")
    ensure_trial(db, u.id)
    ensure_trial(db, u.id)
    assert credit_summary(db, u.id).total == 60


def test_spend_draws_soonest_expiring_first_and_refund_restores(db):
    u = make_user(db, "spend@test.dev")
    grant_credits(db, user_id=u.id, source="pack", amount=100, expires_at=None, description="pack")
    grant_credits(db, user_id=u.id, source="plan", amount=10, expires_at=utcnow() + timedelta(days=5), description="plan")
    tid = spend_credits(db, u.id, 15, "analysis")
    grants = {g.source: g.remaining for g in db.query(CreditGrant).filter_by(userId=u.id)}
    assert grants == {"plan": 0, "pack": 95}
    refund_credits(db, tid, "refund")
    refund_credits(db, tid, "refund again")  # idempotent
    assert credit_summary(db, u.id).total == 110


def test_expired_grants_dont_count(db):
    u = make_user(db, "expired@test.dev")
    grant_credits(db, user_id=u.id, source="plan", amount=50, expires_at=utcnow() - timedelta(seconds=1), description="old")
    assert credit_summary(db, u.id).total == 0
    with pytest.raises(InsufficientCredits) as e:
        spend_credits(db, u.id, 1, "x")
    assert (e.value.needed, e.value.available) == (1, 0)


def test_duplicate_ref_is_ignored(db):
    u = make_user(db, "ref@test.dev")
    assert grant_credits(db, user_id=u.id, source="pack", amount=5, expires_at=None, description="a", ref="pack:abc")
    assert not grant_credits(db, user_id=u.id, source="pack", amount=5, expires_at=None, description="a", ref="pack:abc")
    assert credit_summary(db, u.id).total == 5


def test_concurrent_spends_never_overdraw(db):
    u = make_user(db, "race@test.dev")
    grant_credits(db, user_id=u.id, source="pack", amount=9, expires_at=None, description="pack")

    def spend(_):
        with SessionLocal() as s:
            try:
                spend_credits(s, u.id, 1, "race")
                return True
            except InsufficientCredits:
                return False

    with ThreadPoolExecutor(10) as pool:
        results = list(pool.map(spend, range(10)))
    assert results.count(True) == 9
    assert credit_summary(db, u.id).total == 0


def test_by_source_groups_and_keeps_earliest_expiry(db):
    u = make_user(db, "group@test.dev")
    soon, later = utcnow() + timedelta(days=1), utcnow() + timedelta(days=9)
    grant_credits(db, user_id=u.id, source="plan", amount=3, expires_at=later, description="a")
    grant_credits(db, user_id=u.id, source="plan", amount=4, expires_at=soon, description="b")
    grouped = by_source(credit_summary(db, u.id))
    assert grouped["plan"]["remaining"] == 7
    assert abs((grouped["plan"]["expiresAt"] - soon).total_seconds()) < 0.01
