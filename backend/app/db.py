"""Database engine, sessions and the column types shared by every model."""

from __future__ import annotations

import os
import secrets
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import BigInteger, DateTime, create_engine, event
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from .config import settings


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetimes.

    On SQLite they are stored as integer milliseconds since the epoch (the format the
    database already uses); on Postgres as native `timestamptz`.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(BigInteger())
        return dialect.type_descriptor(DateTime(timezone=True))

    def process_bind_param(self, value: datetime | None, dialect: Dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        if dialect.name == "sqlite":
            return int(round(value.timestamp() * 1000))
        return value

    def process_result_value(self, value, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, UTC)
        if isinstance(value, str):
            if value.isdigit():
                return datetime.fromtimestamp(int(value) / 1000, UTC)
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        return value if value.tzinfo else value.replace(tzinfo=UTC)


_counter = int.from_bytes(secrets.token_bytes(3)) % 1679616


def new_id() -> str:
    """Collision-resistant, sortable ids in the same shape as the existing cuid values."""
    global _counter
    _counter = (_counter + 1) % 1679616

    def b36(n: int, width: int) -> str:
        chars = "0123456789abcdefghijklmnopqrstuvwxyz"
        out = ""
        while n:
            n, r = divmod(n, 36)
            out = chars[r] + out
        return out.rjust(width, "0")[-width:]

    return "c" + b36(int(time.time() * 1000), 8) + b36(_counter, 4) + b36(os.getpid(), 2) + b36(secrets.randbits(64), 10)


class Base(DeclarativeBase):
    pass


def _make_engine():
    url = settings.database_url
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(conn, _record):
            cur = conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with SessionLocal() as s:
        yield s
