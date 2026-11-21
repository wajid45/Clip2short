"""Work that continues after the response is sent (video processing, analysis, publishing)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

log = logging.getLogger("clip2short.background")
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="after")


def after(fn: Callable[..., Any], *args: Any) -> None:
    """Runs `fn(*args)` in a worker thread. Errors are logged, never raised into the request."""

    def run() -> None:
        try:
            fn(*args)
        except Exception:
            log.exception("background task failed: %s", getattr(fn, "__name__", fn))

    _pool.submit(run)


def shutdown() -> None:
    _pool.shutdown(wait=False, cancel_futures=True)
