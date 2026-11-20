import re

import pytest
from fastapi.testclient import TestClient

from app import email as email_module
from app.main import app


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []

    def fake_send(to, name, link, minutes):
        sent.append({"to": to, "link": link})

    monkeypatch.setattr("app.routes.profile.send_password_reset", fake_send)
    return sent


def signup(client: TestClient, email: str, password: str = "first-password") -> None:
    r = client.post("/api/auth/signup", json={"name": "Tester", "email": email, "password": password})
    assert r.status_code == 200, r.text


def test_forgot_and_reset_password(outbox):
    a = TestClient(app)
    signup(a, "reset@test.dev")
    other_device = TestClient(app)
    other_device.post("/api/auth/login", json={"email": "reset@test.dev", "password": "first-password"})
    assert other_device.get("/api/page/me").status_code == 200

    # Unknown emails get the same answer and no email.
    assert TestClient(app).post("/api/auth/forgot", json={"email": "nobody@test.dev"}).json() == {"ok": True}
    assert outbox == []

    assert TestClient(app).post("/api/auth/forgot", json={"email": "RESET@test.dev"}).status_code == 200
    token = re.search(r"token=([\w-]+)", outbox[0]["link"]).group(1)
    assert outbox[0]["link"].startswith("http://localhost:3000/reset-password?token=")

    fresh = TestClient(app)
    assert fresh.get(f"/api/auth/reset?token={token}").status_code == 200
    r = fresh.post("/api/auth/reset", json={"token": token, "password": "short"})
    assert r.status_code == 400 and r.json()["code"] == "weak_password" and "12 characters" in r.json()["error"]
    assert fresh.post("/api/auth/reset", json={"token": token, "password": "second-password"}).status_code == 200
    assert fresh.get("/api/page/me").status_code == 200  # signed in by the reset

    # The link is single-use, old sessions are signed out, the old password no longer works.
    assert fresh.post("/api/auth/reset", json={"token": token, "password": "third-password"}).json()["code"] == "invalid_token"
    assert other_device.get("/api/page/me").status_code == 401
    assert TestClient(app).post("/api/auth/login", json={"email": "reset@test.dev", "password": "first-password"}).status_code == 401
    assert TestClient(app).post("/api/auth/login", json={"email": "reset@test.dev", "password": "second-password"}).status_code == 200


def test_profile_password_and_delete():
    c = TestClient(app)
    signup(c, "settings@test.dev")
    other = TestClient(app)
    other.post("/api/auth/login", json={"email": "settings@test.dev", "password": "first-password"})

    assert c.patch("/api/account", json={"name": "New Name", "email": "settings@test.dev"}).json()["name"] == "New Name"
    r = c.patch("/api/account", json={"name": "New Name", "email": "moved@test.dev"})
    assert r.json()["code"] == "password_required"
    assert c.patch("/api/account", json={"name": "New Name", "email": "moved@test.dev", "currentPassword": "first-password"}).status_code == 200

    assert c.post("/api/account/password", json={"currentPassword": "wrong", "newPassword": "second-password"}).json()["code"] == "wrong_password"
    assert c.post("/api/account/password", json={"currentPassword": "first-password", "newPassword": "second-password"}).status_code == 200
    assert c.get("/api/page/settings").json()["email"] == "moved@test.dev"  # this device stays signed in
    assert other.get("/api/page/me").status_code == 401  # other devices are signed out

    assert c.request("DELETE", "/api/account", json={"password": "second-password", "confirm": "nope"}).json()["error"] == "Type DELETE to confirm."
    assert c.request("DELETE", "/api/account", json={"password": "second-password", "confirm": "DELETE"}).status_code == 200
    assert c.get("/api/page/me").status_code == 401
    assert TestClient(app).post("/api/auth/login", json={"email": "moved@test.dev", "password": "second-password"}).status_code == 401


def test_contact_form_and_cors():
    c = TestClient(app)
    r = c.post("/api/contact", json={"name": "Ana", "email": "ana@test.dev", "topic": "sales", "message": "Hello there, tell me more."})
    assert r.json() == {"ok": True}
    assert c.post("/api/contact", json={"name": "Ana", "email": "bad", "message": "Hello there, tell me more."}).json()["error"] == "email: Enter a valid email address"
    pre = c.options(
        "/api/contact", headers={"Origin": "http://localhost:3001", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    )
    assert pre.headers.get("access-control-allow-origin") == "http://localhost:3001"


def test_email_without_key_is_logged_not_sent(caplog):
    caplog.set_level("INFO")
    email_module.send_password_reset("x@test.dev", "X", "http://localhost:3000/reset-password?token=abc", 60)
    assert "reset-password?token=abc" in caplog.text


def test_signup_sends_welcome_and_low_credit_threshold(monkeypatch):
    from app import notify

    sent = []
    monkeypatch.setattr("app.notify.send_welcome", lambda to, name, link, credits: sent.append((to, link, credits)))
    monkeypatch.setattr("app.routes.account.after", lambda fn, *a: fn(*a))  # run the background job inline
    signup(TestClient(app), "welcome@test.dev")
    assert sent and sent[0][0] == "welcome@test.dev" and sent[0][1].endswith("/app")

    assert notify.crossed_low(40, 20) is True
    assert notify.crossed_low(25, 10) is False  # already below: warned before
    assert notify.crossed_low(100, 50) is False
