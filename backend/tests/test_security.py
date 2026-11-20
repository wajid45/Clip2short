"""Sign-in security: password policy, hashing, sessions, limits, notices and request protections."""

import dataclasses

import bcrypt
import httpx
import pytest
from fastapi.testclient import TestClient

from app import passwords
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import User

GOOD = "violet tram harbour"


def signup(email: str, password: str = GOOD, name: str = "Robin Example") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/signup", json={"name": name, "email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.mark.parametrize(
    ("pw", "why"),
    [
        ("short-pass", "12 characters"),
        ("x" * 129, "at most 128"),
        ("aaaaaaaaaaaaaaa", "too easy"),
        ("password1234", "most common"),
        ("Password!!2026", "most common"),
        ("shortlark2026!!", "your name, your email or Shortlark"),
        ("robinexample99!", "your name, your email or Shortlark"),
    ],
)
def test_weak_passwords_are_refused(pw, why):
    problem = passwords.password_problem(pw, email="robin.example@test.dev", name="Robin Example")
    assert problem and why in problem


def test_good_passwords_pass_including_spaces_and_unicode():
    assert passwords.password_problem(GOOD, email="a@test.dev") is None
    assert passwords.password_problem("überraschung tee 7", email="a@test.dev") is None


def test_breach_check_uses_k_anonymity(monkeypatch):
    seen = {}

    def fake_get(url, headers, timeout):
        seen["url"] = url
        suffix = __import__("hashlib").sha1(GOOD.encode()).hexdigest().upper()[5:]
        return httpx.Response(200, text=f"0000000000000000000000000000000000A:0\r\n{suffix}:42", request=httpx.Request("GET", url))

    monkeypatch.setattr(passwords, "settings", dataclasses.replace(settings, password_breach_check=True))
    monkeypatch.setattr(passwords.httpx, "get", fake_get)
    assert "data breach" in passwords.password_problem(GOOD, email="a@test.dev")
    assert seen["url"].endswith("/range/" + __import__("hashlib").sha1(GOOD.encode()).hexdigest().upper()[:5])  # only 5 characters leave


def test_breach_check_fails_open(monkeypatch):
    def down(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(passwords, "settings", dataclasses.replace(settings, password_breach_check=True))
    monkeypatch.setattr(passwords.httpx, "get", down)
    assert passwords.password_problem(GOOD, email="a@test.dev") is None


def test_signup_refuses_a_weak_password():
    r = TestClient(app).post("/api/auth/signup", json={"name": "Weak", "email": "weak@test.dev", "password": "password1234"})
    assert r.status_code == 400 and r.json()["code"] == "weak_password"


def test_whole_password_counts_and_old_hashes_upgrade():
    long_a, long_b = "a" * 70 + " tram harbour one", "a" * 70 + " tram harbour two"  # differ after byte 72
    h = passwords.hash_password(long_a)
    assert passwords.verify_password(long_a, h) and not passwords.verify_password(long_b, h)

    # An account hashed the old way still signs in, and its hash is upgraded on the way.
    with SessionLocal() as s:
        s.add(User(email="legacy@test.dev", name="Old", passwordHash=bcrypt.hashpw(b"legacy password!", bcrypt.gensalt(4)).decode()))
        s.commit()
    assert TestClient(app).post("/api/auth/login", json={"email": "legacy@test.dev", "password": "legacy password!"}).status_code == 200
    with SessionLocal() as s:
        user = s.query(User).filter_by(email="legacy@test.dev").one()
        assert user.passwordHash.startswith("$sl2$") and not passwords.needs_rehash(user.passwordHash)
    assert TestClient(app).post("/api/auth/login", json={"email": "legacy@test.dev", "password": "legacy password!"}).status_code == 200


def test_sign_out_ends_the_session_on_the_server():
    c = signup("logout@test.dev")
    stolen = dict(c.cookies)
    assert c.get("/api/page/me").status_code == 200
    assert c.post("/api/auth/logout").status_code == 200
    copy = TestClient(app, cookies=stolen)
    assert copy.get("/api/page/me").status_code == 401  # a copied cookie no longer works


def test_login_is_limited_per_account_across_ips():
    signup("stuffing@test.dev")
    for i in range(10):
        c = TestClient(app, headers={"x-forwarded-for": f"10.0.0.{i}"})
        assert c.post("/api/auth/login", json={"email": "stuffing@test.dev", "password": f"guess number {i}"}).status_code == 401
    r = TestClient(app).post("/api/auth/login", json={"email": "stuffing@test.dev", "password": GOOD})
    assert r.status_code == 429


def test_forgot_password_answers_the_same_for_unknown_emails(monkeypatch):
    def broken(*a):
        raise RuntimeError("email down")

    monkeypatch.setattr("app.routes.profile.send_password_reset", broken)
    signup("known@test.dev")
    known = TestClient(app).post("/api/auth/forgot", json={"email": "known@test.dev"})
    unknown = TestClient(app).post("/api/auth/forgot", json={"email": "nobody@test.dev"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()


def test_password_and_email_changes_send_notices(monkeypatch):
    notices: list[tuple[str, str]] = []
    monkeypatch.setattr("app.notify.send_security_notice", lambda to, name, title, what, link: notices.append((to, title)))
    c = signup("notice@test.dev")
    assert c.post("/api/account/password", json={"currentPassword": GOOD, "newPassword": "copper kite meadow"}).status_code == 200
    assert c.patch("/api/account", json={"name": "Robin", "email": "moved-notice@test.dev", "currentPassword": "copper kite meadow"}).status_code == 200
    assert notices == [("notice@test.dev", "Your password was changed"), ("notice@test.dev", "Your sign-in email was changed")]


def test_cross_site_writes_are_refused_and_headers_sent():
    c = signup("csrf@test.dev")
    r = c.post("/api/account/password", json={"currentPassword": GOOD, "newPassword": "copper kite meadow"}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    r = c.post("/api/auth/logout", headers={"sec-fetch-site": "cross-site"})
    assert r.status_code == 403
    ok = c.get("/api/page/me")
    assert ok.headers["x-content-type-options"] == "nosniff"
    assert ok.headers["x-frame-options"] == "DENY"
    assert ok.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in ok.headers["content-security-policy"]
    # The landing site may still post the contact form.
    r = TestClient(app).post("/api/contact", json={"name": "A", "email": "a@test.dev", "message": "Hello there, a question."}, headers={"origin": settings.landing_url})
    assert r.status_code == 200


def test_admin_session_idles_out_and_never_passes_twelve_hours():
    import time

    from app import portal

    now = int(time.time())
    _, ttl = portal._portal_token("u", 0, 0, now)
    assert ttl == portal.PORTAL_IDLE == 30 * 60
    _, ttl = portal._portal_token("u", 0, 0, now - portal.PORTAL_MAX_AGE + 60)  # 11h59m after sign-in
    assert 0 < ttl <= 60
    _, ttl = portal._portal_token("u", 0, 0, now - portal.PORTAL_MAX_AGE - 1)
    assert ttl == 0
