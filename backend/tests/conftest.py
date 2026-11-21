"""Tests run against a throwaway in-memory MongoDB (mongomock), never the real cluster."""

import os

os.environ["MONGODB_URI"] = "mongomock://"
os.environ["MONGODB_DB"] = "shortlark_test"
os.environ["INTERNAL_SCHEDULER"] = "false"
os.environ["GEMINI_API_KEY"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["STRIPE_SECRET_KEY"] = ""
os.environ["PASSWORD_BREACH_CHECK"] = "false"

import pytest  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import SessionLocal  # noqa: E402


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


class _Inline:
    """Runs background jobs straight away, so tests see emails and notices without waiting."""

    def submit(self, fn, *args):
        fn(*args)


@pytest.fixture(autouse=True)
def _inline_background(monkeypatch):
    from app import background, ratelimit

    monkeypatch.setattr(background, "_pool", _Inline())
    ratelimit._buckets.clear()
