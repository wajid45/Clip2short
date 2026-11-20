"""Small fixed-window limiter for abuse-prone endpoints (login, signup, leads, imports).

In-memory, so per process; put a shared store (Redis) in front for multi-instance deployments.
"""

from __future__ import annotations

import hashlib
import threading
import time

from fastapi import Request

from .config import settings
from .http import HttpError

_buckets: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return (request.client.host if request.client else None) or request.headers.get("x-real-ip") or "unknown"


def rate_limit(request: Request, key: str, limit: int, window_sec: float) -> None:
    """Per client IP."""
    hit(f"{key}:{client_ip(request)}", limit, window_sec)


def rate_limit_account(key: str, email: str, limit: int, window_sec: float) -> None:
    """Per account, whichever IP the attempts come from (credential stuffing, email bombing).

    Applies to any email typed, existing or not, so the limit itself reveals nothing.
    """
    hit(f"{key}:acct:{hashlib.sha256(email.strip().lower().encode()).hexdigest()}", limit, window_sec)


def hit(bucket: str, limit: int, window_sec: float) -> None:
    now = time.monotonic()
    with _lock:
        count, reset = _buckets.get(bucket, (0, 0.0))
        if reset < now:
            _buckets[bucket] = (1, now + window_sec)
            if len(_buckets) > 10000:
                for k, (_, r) in list(_buckets.items()):
                    if r < now:
                        del _buckets[k]
            return
        count += 1
        _buckets[bucket] = (count, reset)
    if count > limit:
        raise HttpError(429, "Too many attempts. Please wait a moment and try again.")
