"""Tests run against a throwaway SQLite database, never the development one."""

import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="shortlark-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["INTERNAL_SCHEDULER"] = "false"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["STRIPE_SECRET_KEY"] = ""

import pytest  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s
