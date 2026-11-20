"""Admin portal: authenticator sign-in, sessions, and the user actions."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app import ratelimit
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import AdminTotp
from app.portal import match_totp, totp_now

ADMIN = "boss@test.dev"


@pytest.fixture(autouse=True)
def admin_env():
    old = settings.admin_emails
    object.__setattr__(settings, "admin_emails", (ADMIN,))
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
    if body.get("step") == "enroll":
        secret = body["secret"]
        assert body["otpauthUrl"].startswith("otpauth://totp/Shortlark%20Admin:")
        r = c.post("/api/portal/auth/enroll", json={"enrollToken": body["enrollToken"], "code": totp_now(secret)})
        assert r.status_code == 200, r.text
        enrolled_admin.secret = secret  # type: ignore[attr-defined]
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
    assert c.get("/api/portal/auth/me").json()["email"] == ADMIN

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
