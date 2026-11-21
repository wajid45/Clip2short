"""MongoDB connection, sessions, and the id and time helpers every model uses."""

from __future__ import annotations

import os
import re
import secrets
import threading
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote_plus

from . import odm
from .config import settings
from .odm import Model as Base  # noqa: F401 - models subclass Base, as before
from .odm import Session


def utcnow() -> datetime:
    # MongoDB keeps milliseconds, so values read back compare equal to what was written.
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


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


def mongo_uri() -> str:
    """The connection string, with any <db_username>/<db_password> placeholders filled in."""
    uri = settings.mongodb_uri
    user, password = os.environ.get("MONGODB_USERNAME", ""), os.environ.get("MONGODB_PASSWORD", "")
    if user:
        uri = re.sub(r"<db_username>|<username>", quote_plus(user), uri)
    if password:
        uri = re.sub(r"<db_password>|<password>", quote_plus(password), uri)
    return uri


_client: Any = None
_lock = threading.Lock()


def database() -> Any:
    """The shared database handle (one client per process). Indexes are created on first use."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                uri = mongo_uri()
                if uri.startswith("mongomock://"):
                    import mongomock  # dev dependency: tests run on an in-memory database

                    client = mongomock.MongoClient(tz_aware=True)
                else:
                    from pymongo import MongoClient

                    client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=10_000, appname="clip2short-api")
                odm.ensure_indexes(client[settings.mongodb_db])
                _client = client
    return _client[settings.mongodb_db]


odm.configure(database)


def SessionLocal() -> Session:  # noqa: N802 - the name the code has always used
    return Session(database())


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with SessionLocal() as s:
        yield s
