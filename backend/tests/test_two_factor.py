"""Optional two-factor sign-in for app users."""

import time

from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.portal import totp_now

PW = "violet tram harbour"


def signup(email: str) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/signup", json={"name": "Two Factor", "email": email, "password": PW})
    assert r.status_code == 200, r.text
    return c


def code_at(secret: str, steps_ahead: int = 0) -> str:
    return totp_now(secret, time.time() + 30 * steps_ahead)


def enable(c: TestClient) -> tuple[str, list[str]]:
    assert c.post("/api/account/2fa/start", json={"password": "wrong password"}).json()["code"] == "wrong_password"
    start = c.post("/api/account/2fa/start", json={"password": PW}).json()
    assert start["otpauthUrl"].startswith("otpauth://totp/Clip2Short:")
    assert c.post("/api/account/2fa/confirm", json={"code": "000000"}).json()["code"] == "bad_code"
    r = c.post("/api/account/2fa/confirm", json={"code": code_at(start["secret"])})
    assert r.status_code == 200, r.text
    codes = r.json()["backupCodes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    return start["secret"], codes


def login(email: str) -> tuple[TestClient, dict]:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return c, r.json()


def test_off_by_default_and_turning_it_on_needs_password_and_code():
    c = signup("tfa-on@test.dev")
    assert c.get("/api/account/2fa").json() == {"enabled": False, "enabledAt": None, "backupCodesLeft": 0}
    _, out = login("tfa-on@test.dev")
    assert out == {"ok": True}  # no 2FA yet: password alone signs in
    enable(c)
    assert c.get("/api/page/me").status_code == 200  # this session was re-issued
    st = c.get("/api/account/2fa").json()
    assert st["enabled"] and st["backupCodesLeft"] == 10
    assert c.get("/api/page/settings").json()["twoFactor"]["enabled"] is True


def test_sign_in_needs_the_code_and_refuses_replay():
    c = signup("tfa-login@test.dev")
    secret, _ = enable(c)
    other, out = login("tfa-login@test.dev")
    assert out["step"] == "code" and "challenge" in out
    assert other.get("/api/page/me").status_code == 401  # nothing signed in after the password alone

    bad = other.post("/api/auth/login/code", json={"challenge": out["challenge"], "code": "000000"})
    assert bad.status_code == 401 and bad.json()["code"] == "bad_code"
    good = code_at(secret, 1)
    assert other.post("/api/auth/login/code", json={"challenge": out["challenge"], "code": good}).status_code == 200
    assert other.get("/api/page/me").status_code == 200

    third, out3 = login("tfa-login@test.dev")
    assert third.post("/api/auth/login/code", json={"challenge": out3["challenge"], "code": good}).status_code == 401  # same code twice


def test_challenge_is_checked():
    c = signup("tfa-challenge@test.dev")
    secret, _ = enable(c)
    r = TestClient(app).post("/api/auth/login/code", json={"challenge": "not-a-real-challenge-token", "code": code_at(secret, 1)})
    assert r.status_code == 400 and r.json()["code"] == "challenge_expired"


def test_backup_codes_work_once_and_can_be_replaced():
    c = signup("tfa-backup@test.dev")
    secret, codes = enable(c)
    other, out = login("tfa-backup@test.dev")
    r = other.post("/api/auth/login/code", json={"challenge": out["challenge"], "code": codes[0].upper()})
    assert r.status_code == 200 and r.json()["backupCodesLeft"] == 9
    again, out2 = login("tfa-backup@test.dev")
    assert again.post("/api/auth/login/code", json={"challenge": out2["challenge"], "code": codes[0]}).status_code == 401

    r = c.post("/api/account/2fa/backup-codes", json={"password": PW, "code": codes[1]})
    assert r.status_code == 200
    fresh = r.json()["backupCodes"]
    _, out3 = login("tfa-backup@test.dev")
    assert again.post("/api/auth/login/code", json={"challenge": out3["challenge"], "code": codes[2]}).status_code == 401  # old set is gone
    _, out4 = login("tfa-backup@test.dev")
    assert again.post("/api/auth/login/code", json={"challenge": out4["challenge"], "code": fresh[0]}).status_code == 200


def test_code_guesses_are_limited_per_account():
    c = signup("tfa-limit@test.dev")
    enable(c)
    for i in range(5):
        attacker = TestClient(app, headers={"x-forwarded-for": f"10.1.0.{i}"})
        out = attacker.post("/api/auth/login", json={"email": "tfa-limit@test.dev", "password": PW}).json()
        assert attacker.post("/api/auth/login/code", json={"challenge": out["challenge"], "code": f"{i:06d}"}).status_code == 401
    attacker = TestClient(app, headers={"x-forwarded-for": "10.1.0.99"})
    out = attacker.post("/api/auth/login", json={"email": "tfa-limit@test.dev", "password": PW}).json()
    assert attacker.post("/api/auth/login/code", json={"challenge": out["challenge"], "code": "123456"}).status_code == 429


def test_turning_it_off_needs_password_and_code():
    c = signup("tfa-off@test.dev")
    secret, _ = enable(c)
    assert c.post("/api/account/2fa/disable", json={"password": PW, "code": "000000"}).json()["code"] == "bad_code"
    assert c.post("/api/account/2fa/disable", json={"password": "wrong password", "code": code_at(secret, 1)}).json()["code"] == "wrong_password"
    assert c.post("/api/account/2fa/disable", json={"password": PW, "code": code_at(secret, 1)}).status_code == 200
    _, out = login("tfa-off@test.dev")
    assert out == {"ok": True}


def test_password_reset_does_not_skip_the_code(monkeypatch):
    links: list[str] = []
    monkeypatch.setattr("app.routes.profile.send_password_reset", lambda to, name, link, minutes: links.append(link))
    c = signup("tfa-reset@test.dev")
    enable(c)
    TestClient(app).post("/api/auth/forgot", json={"email": "tfa-reset@test.dev"})
    token = links[0].split("token=")[1]
    fresh = TestClient(app)
    r = fresh.post("/api/auth/reset", json={"token": token, "password": "copper kite meadow"})
    assert r.status_code == 200 and r.json() == {"ok": True, "signIn": True}
    assert fresh.get("/api/page/me").status_code == 401  # the emailed link alone doesn't sign in
    r = TestClient(app).post("/api/auth/login", json={"email": "tfa-reset@test.dev", "password": "copper kite meadow"})
    assert r.json()["step"] == "code"


def test_signup_says_when_the_account_exists():
    signup("tfa-exists@test.dev")
    ratelimit._buckets.clear()
    r = TestClient(app).post("/api/auth/signup", json={"name": "Again", "email": "tfa-exists@test.dev", "password": PW})
    assert r.status_code == 409 and r.json()["code"] == "account_exists"


def test_changing_email_needs_the_code_when_two_factor_is_on():
    c = signup("tfa-email@test.dev")
    secret, backup = enable(c)
    move = {"name": "Two Factor", "email": "tfa-email-new@test.dev", "currentPassword": PW}
    assert c.patch("/api/account", json=move).json()["code"] == "code_required"
    assert c.patch("/api/account", json={**move, "code": "000000"}).json()["code"] == "bad_code"
    r = c.patch("/api/account", json={**move, "code": code_at(secret, 1)})
    assert r.status_code == 200 and r.json()["email"] == "tfa-email-new@test.dev"
