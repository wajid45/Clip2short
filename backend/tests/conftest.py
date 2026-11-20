"""Tests run against a throwaway SQLite database, never the development one."""

import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="shortlark-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["INTERNAL_SCHEDULER"] = "false"
os.environ["GEMINI_API_KEY"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["STRIPE_SECRET_KEY"] = ""
os.environ["PASSWORD_BREACH_CHECK"] = "false"

import pytest  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)


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
