"""Admin portal: authenticator sign-in, sessions, and the user actions."""

import time

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import AdminTotp
from app.odm import update
from app.portal import match_totp, totp_now

ADMIN = "boss@test.dev"
EMAILED: list[tuple[str, str]] = []  # (to, code) of admin setup emails


@pytest.fixture(autouse=True)
def admin_env(monkeypatch):
    old = settings.admin_emails
    object.__setattr__(settings, "admin_emails", (ADMIN,))
    monkeypatch.setattr("app.routes.portal.send_admin_code", lambda to, name, code, minutes: EMAILED.append((to, code)))
    ratelimit._buckets.clear()
    yield
    object.__setattr__(settings, "admin_emails", old)


def allow_code_reuse() -> None:
    with SessionLocal() as db:
        db.execute(update(AdminTotp).values(lastStep=0))
        db.commit()


def signup(email: str, password: str = "admin-password") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/signup", json={"name": "Person", "email": email, "password": password})
    assert r.status_code in (200, 409), r.text
    return c


def enrolled_admin() -> tuple[TestClient, str]:
    """Signs the admin in to the portal (enrolling on first use) and returns the client and secret."""
    signup(ADMIN)
    ratelimit._buckets.clear()
    c = TestClient(app)
    r = c.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password"})
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("step") == "code":
        allow_code_reuse()  # each 30-second code works once; tests sign in many times a minute
        r = c.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password", "code": totp_now(enrolled_admin.secret)})  # type: ignore[attr-defined]
        assert r.status_code == 200, r.text
    if body.get("step") == "verify-email":
        assert "secret" not in body  # no QR code before the inbox answers
        r = c.post("/api/portal/auth/enroll/email", json={"emailToken": body["emailToken"], "code": EMAILED[-1][1]})
        assert r.status_code == 200, r.text
        body = r.json()
    if body.get("step") == "enroll":
        secret = body["secret"]
        assert body["otpauthUrl"].startswith("otpauth://totp/Clip2Short%20Admin:")
        r = c.post("/api/portal/auth/enroll", json={"enrollToken": body["enrollToken"], "code": totp_now(secret)})
        assert r.status_code == 200, r.text
        enrolled_admin.secret = secret  # type: ignore[attr-defined]
    ratelimit._buckets.clear()  # setup takes 3 to 4 calls of the 6-a-minute allowance; tests start fresh
    return c, enrolled_admin.secret  # type: ignore[attr-defined]


def test_totp_matches_rfc6238_vectors():
    # RFC 6238 appendix B, SHA-1 secret "12345678901234567890" (base32 below), truncated to 6 digits.
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert totp_now(secret, at=59) == "287082"
    assert totp_now(secret, at=1111111109) == "081804"
    assert totp_now(secret, at=1234567890) == "005924"
    step = match_totp(secret, "005924", at=1234567890)
    assert step is not None
    assert match_totp(secret, "005924", after_step=step, at=1234567890) is None  # no replay
    assert match_totp(secret, "000000", at=1234567890) is None


def test_portal_sign_in_needs_password_and_code():
    c, secret = enrolled_admin()
    me = c.get("/api/portal/auth/me").json()
    assert me["email"] == ADMIN and me["appUrl"].endswith("/api/auth/from-admin")

    fresh = TestClient(app)
    # The app session never opens the portal.
    app_only = signup(ADMIN)
    assert app_only.get("/api/portal/overview").status_code == 401
    # Wrong password and wrong code read the same.
    r = fresh.post("/api/portal/auth/login", json={"email": ADMIN, "password": "nope-nope"})
    assert r.status_code == 401 and r.json()["error"] == "That email, password or code doesn't match."
    assert fresh.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password"}).json() == {"step": "code"}
    r = fresh.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password", "code": "123456"})
    assert r.status_code == 401 and r.json()["error"] == "That email, password or code doesn't match."
    # A code from the next 30-second window works once.
    code = totp_now(secret, at=time.time() + 30)
    assert fresh.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password", "code": code}).status_code == 200
    ratelimit._buckets.clear()  # 6 attempts a minute per IP: the limit itself is working
    replay = TestClient(app)
    assert replay.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password", "code": code}).status_code == 401
    assert fresh.get("/api/portal/overview").status_code == 200


def test_non_admins_cannot_sign_in_to_portal():
    signup("regular@test.dev")
    r = TestClient(app).post("/api/portal/auth/login", json={"email": "regular@test.dev", "password": "admin-password"})
    assert r.status_code == 401
    assert TestClient(app).get("/api/portal/users").status_code == 401


def test_user_actions_grant_suspend_signout():
    c, _ = enrolled_admin()
    customer = signup("customer@test.dev")
    users = c.get("/api/portal/users", params={"q": "customer@"}).json()
    assert users["total"] == 1
    uid = users["users"][0]["id"]
    before = users["users"][0]["credits"]

    r = c.post(f"/api/portal/users/{uid}/credits", json={"amount": 25, "note": "Sorry about the outage"})
    assert r.status_code == 200
    detail = c.get(f"/api/portal/users/{uid}").json()
    assert detail["credits"]["total"] == before + 25
    assert detail["transactions"][0]["description"] == "Sorry about the outage"
    assert detail["history"][0]["action"] == "credits_granted"
    assert c.post(f"/api/portal/users/{uid}/credits", json={"amount": 0}).status_code == 400

    # Suspension signs the customer out and blocks sign-in until lifted.
    assert customer.get("/api/page/me").status_code == 200
    assert c.post(f"/api/portal/users/{uid}/suspend", json={"reason": "Chargeback"}).status_code == 200
    assert customer.get("/api/page/me").status_code == 401
    r = TestClient(app).post("/api/auth/login", json={"email": "customer@test.dev", "password": "admin-password"})
    assert r.status_code == 403 and r.json()["code"] == "suspended"
    assert c.get("/api/portal/users", params={"filter": "suspended"}).json()["total"] >= 1
    assert c.post(f"/api/portal/users/{uid}/unsuspend").status_code == 200
    again = TestClient(app)
    assert again.post("/api/auth/login", json={"email": "customer@test.dev", "password": "admin-password"}).status_code == 200

    # Sign out everywhere.
    assert c.post(f"/api/portal/users/{uid}/signout").status_code == 200
    assert again.get("/api/page/me").status_code == 401

    # Admins can't be suspended from the portal.
    me = c.get("/api/portal/auth/me").json()["id"]
    assert c.post(f"/api/portal/users/{me}/suspend", json={}).status_code == 400

    overview = c.get("/api/portal/overview").json()
    assert overview["kpis"]["users"] >= 2 and len(overview["signupsByDay"]) == 30 and len(overview["signupsByMonth"]) == 12


def test_replacing_the_authenticator_ends_other_portal_sessions():
    c, old_secret = enrolled_admin()
    other = TestClient(app)
    allow_code_reuse()
    other.post("/api/portal/auth/login", json={"email": ADMIN, "password": "admin-password", "code": totp_now(old_secret)})
    assert other.get("/api/portal/auth/me").status_code == 200

    ratelimit._buckets.clear()
    assert c.post("/api/portal/auth/authenticator/start", json={"password": "wrong"}).status_code == 400
    r = c.post("/api/portal/auth/authenticator/start", json={"password": "admin-password"})
    new_secret = r.json()["secret"]
    assert c.post("/api/portal/auth/authenticator/confirm", json={"code": "000000"}).status_code == 400
    assert c.post("/api/portal/auth/authenticator/confirm", json={"code": totp_now(new_secret)}).status_code == 200
    enrolled_admin.secret = new_secret  # type: ignore[attr-defined]

    assert c.get("/api/portal/auth/me").status_code == 200  # this session was re-issued
    assert other.get("/api/portal/auth/me").status_code == 401  # the other one ended


def test_admin_email_must_answer_before_any_qr_code():
    """Admin rights come from ADMIN_EMAILS and sign-up doesn't prove an address, so the inbox must answer first."""
    other = "second-boss@test.dev"
    object.__setattr__(settings, "admin_emails", (ADMIN, other))
    stranger = signup(other)  # anyone can register an admin address nobody has claimed yet
    assert stranger.get("/api/page/me").json()["isAdmin"] is False
    r = TestClient(app).post("/api/portal/auth/login", json={"email": other, "password": "admin-password"})
    body = r.json()
    assert body["step"] == "verify-email" and "secret" not in body and "otpauthUrl" not in body
    assert EMAILED[-1][0] == other  # the code went to the real inbox, not into the response
    token = body["emailToken"]
    wrong = "000000" if EMAILED[-1][1] != "000000" else "111111"
    r = TestClient(app).post("/api/portal/auth/enroll/email", json={"emailToken": token, "code": wrong})
    assert r.status_code == 400 and r.json()["code"] == "bad_code"
    r = TestClient(app).post("/api/portal/auth/enroll/email", json={"emailToken": token + "x", "code": EMAILED[-1][1]})
    assert r.json()["code"] == "enroll_expired"  # a tampered token is refused
    ratelimit._buckets.clear()
    for _ in range(5):
        TestClient(app).post("/api/portal/auth/enroll/email", json={"emailToken": token, "code": wrong})
    assert TestClient(app).post("/api/portal/auth/enroll/email", json={"emailToken": token, "code": wrong}).status_code == 429


def test_payments_are_recorded_once_refunds_update_and_admins_can_edit():
    from app.models import Payment
    from app.payments import record_payment, record_refund

    c, _ = enrolled_admin()
    buyer = signup("buyer@test.dev")
    uid = buyer.get("/api/page/me").json()["email"] and None
    with SessionLocal() as db:
        from app.models import User as U

        uid = db.query(U).filter_by(email="buyer@test.dev").one().id
        record_payment(db, ref="cs_test_1", user_id=uid, kind="pack", status="paid", amount_cents=3900, description="Credit pack, 500 credits", payment_intent="pi_1")
        record_payment(db, ref="cs_test_1", user_id=uid, kind="pack", status="paid", amount_cents=3900, description="Credit pack, 500 credits", payment_intent="pi_1")  # retried webhook
        assert db.query(Payment).filter_by(ref="cs_test_1").count() == 1
        record_refund(db, payment_intent="pi_1", invoice=None, refunded_cents=1000, amount_cents=3900)
        assert db.query(Payment).filter_by(ref="cs_test_1").one().status == "partially_refunded"
        record_payment(db, ref="cs_test_1", user_id=uid, kind="pack", status="paid", amount_cents=3900, description="Credit pack, 500 credits")
        pid = db.query(Payment).filter_by(ref="cs_test_1").one().id
        assert db.get(Payment, pid).status == "partially_refunded"  # a late "paid" never hides a refund

    data = c.get("/api/portal/payments").json()
    row = next(p for p in data["payments"] if p["id"] == pid)
    assert row["amountCents"] == 3900 and row["refundedCents"] == 1000 and row["email"] == "buyer@test.dev"
    assert c.get("/api/portal/payments?status=refunded").json()["total"] >= 1

    r = c.patch(f"/api/portal/payments/{pid}", json={"status": "refunded", "tags": ["VIP", "vip", " Disputed "]})
    assert r.status_code == 200 and r.json() == {"ok": True, "status": "refunded", "tags": ["VIP", "Disputed"]}
    assert TestClient(app).patch(f"/api/portal/payments/{pid}", json={"status": "paid"}).status_code == 401  # admins only


def test_admin_changes_a_plan_without_stripe():
    c, _ = enrolled_admin()
    signup("upgrade@test.dev")
    users = c.get("/api/portal/users?q=upgrade@test.dev").json()["users"]
    uid = users[0]["id"]
    r = c.post(f"/api/portal/users/{uid}/plan", json={"plan": "pro", "grantCredits": True})
    assert r.status_code == 200 and "Pro" in r.json()["detail"]
    u = c.get(f"/api/portal/users/{uid}").json()["user"]
    assert u["plan"] == "pro" and u["activePlan"]
    assert c.get(f"/api/portal/users/{uid}").json()["credits"]["total"] >= 500
    r = c.post(f"/api/portal/users/{uid}/plan", json={"plan": "none"})
    assert r.status_code == 200 and not c.get(f"/api/portal/users/{uid}").json()["user"]["activePlan"]


def test_admins_reset_each_others_authenticator_but_not_their_own():
    c, _ = enrolled_admin()
    me = c.get("/api/portal/auth/me").json()
    assert c.post(f"/api/portal/users/{me['id']}/reset-authenticator", json={}).status_code == 400
    regular = signup("not-admin@test.dev")
    rid = c.get("/api/portal/users?q=not-admin@test.dev").json()["users"][0]["id"]
    assert c.post(f"/api/portal/users/{rid}/reset-authenticator", json={}).json()["error"].startswith("Only admin accounts")
    assert regular.get("/api/page/me").status_code == 200


def test_ai_usage_is_counted_and_priced():
    import dataclasses
    from types import SimpleNamespace as N

    from app.ai import usage
    from app.models import AiUsage

    old = usage.settings
    usage.settings = dataclasses.replace(settings, gemini_prices={"priced-model": (0.5, 2.0)})
    try:
        usage.record(N(usage_metadata=N(prompt_token_count=1_000_000, candidates_token_count=200_000, thoughts_token_count=300_000, cached_content_token_count=0)), model="priced-model", purpose="analysis")
        usage.record(N(usage_metadata=N(prompt_token_count=10, candidates_token_count=5, thoughts_token_count=0, cached_content_token_count=0)), model="other-model", purpose="suggest")
        usage.record(object(), model="x", purpose="analysis")  # no usage data: ignored, never raises
    finally:
        usage.settings = old
    with SessionLocal() as db:
        priced = db.query(AiUsage).filter_by(model="priced-model").one()
        assert priced.outputTokens == 500_000 and priced.costMicros == 1_500_000  # $0.50 in + $1.00 out
        assert db.query(AiUsage).filter_by(model="other-model").one().costMicros is None
    c, _ = enrolled_admin()
    ov = c.get("/api/portal/overview").json()
    assert ov["ai"]["calls30d"] >= 2 and len(ov["ai"]["costByDay"]) == 30 and len(ov["revenueByDay"]) == 30


def test_bulk_tags_and_stripe_details_on_the_user_page():
    from app.models import User as U
    from app.payments import record_payment

    c, _ = enrolled_admin()
    signup("tagged@test.dev")
    with SessionLocal() as db:
        uid = db.query(U).filter_by(email="tagged@test.dev").one().id
        ids = [record_payment(db, ref=f"in_tag_{i}", user_id=uid, kind="plan", status="paid", amount_cents=2400, description="Creator plan, renewal").id for i in range(2)]
        record_payment(db, ref="in_tag_failed", user_id=uid, kind="plan", status="failed", amount_cents=2400, description="Creator plan, renewal")
    r = c.post("/api/portal/payments/tags", json={"ids": ids, "add": ["VIP", "vip", "Q4 promo"]})
    assert r.status_code == 200 and r.json()["changed"] == 2
    data = c.get("/api/portal/payments").json()
    assert {"VIP", "Q4 promo"} <= set(data["allTags"])
    assert all(p["tags"] == ["VIP", "Q4 promo"] for p in data["payments"] if p["id"] in ids)
    c.post("/api/portal/payments/tags", json={"ids": ids[:1], "remove": ["vip"]})
    assert next(p for p in c.get("/api/portal/payments").json()["payments"] if p["id"] == ids[0])["tags"] == ["Q4 promo"]

    stripe = c.get(f"/api/portal/users/{uid}").json()["stripe"]
    assert stripe["paidCents"] == 4800 and stripe["payments"] == 2 and stripe["failed"] == 1 and stripe["customerUrl"] is None


def test_dashboard_locks_after_30_idle_minutes_even_with_the_tab_left_open():
    """Switching to the app leaves the dashboard idle: background refreshes don't keep it unlocked."""
    import jwt as pyjwt

    from app.portal import PORTAL_COOKIE, PORTAL_IDLE, _key

    c, _ = enrolled_admin()
    # A real action slides the 30-minute window forward (a fresh cookie comes back).
    r = c.get("/api/portal/overview")
    assert r.status_code == 200 and any(h.startswith(f"{PORTAL_COOKIE}=") for h in r.headers.get_list("set-cookie"))
    # The open tab's automatic refreshes don't count as using the dashboard.
    r = c.get("/api/portal/badges", headers={"X-Background": "1"})
    assert r.status_code == 200 and not any(h.startswith(f"{PORTAL_COOKIE}=") for h in r.headers.get_list("set-cookie"))
    # 30 minutes later, with no real activity, the session has run out: sign-in needed again.
    claims = pyjwt.decode(c.cookies.get(PORTAL_COOKIE), _key(), algorithms=["HS256"])
    assert claims["exp"] - claims["iat"] <= PORTAL_IDLE
    expired = pyjwt.encode({**claims, "iat": claims["iat"] - PORTAL_IDLE - 1, "exp": claims["iat"] - 1}, _key(), algorithm="HS256")
    assert TestClient(app, cookies={PORTAL_COOKIE: expired}).get("/api/portal/overview").status_code == 401


def test_open_app_from_the_dashboard_signs_in_without_asking_again():
    from app.security import SESSION_COOKIE

    c, _ = enrolled_admin()
    url = c.post("/api/portal/auth/app-handoff", json={}).json()["url"]
    path = url.split("http://localhost:3000", 1)[-1]
    fresh = TestClient(app)  # a browser with no app session at all
    r = fresh.get(path, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/app" and fresh.cookies.get(SESSION_COOKIE)
    assert fresh.get("/api/page/me").json()["email"] == ADMIN

    # The pass works once: a copied link falls back to the normal sign-in.
    again = TestClient(app).get(path, follow_redirects=False)
    assert again.headers["location"] == "/login?next=%2Fapp&switch=1"
    # Only a signed-in dashboard can make a pass; a tampered one is ignored.
    assert TestClient(app).post("/api/portal/auth/app-handoff", json={}).status_code == 401
    assert TestClient(app).get(path + "x", follow_redirects=False).headers["location"].startswith("/login")


def test_leads_live_in_the_portal_only():
    TestClient(app).post("/api/leads", json={"email": "lead-portal@test.dev", "source": "landing-hero"}, headers={"Origin": "http://localhost:3001"})
    c, _ = enrolled_admin()
    data = c.get("/api/portal/leads").json()
    assert any(lead["email"] == "lead-portal@test.dev" for lead in data["leads"]) and data["total"] >= 1
    csv = c.get("/api/portal/leads/export")
    assert csv.status_code == 200 and "lead-portal@test.dev" in csv.text
    assert TestClient(app).get("/api/portal/leads").status_code == 401  # signed out
    assert c.get("/api/page/admin/leads").status_code == 404  # the old in-app admin page is gone
