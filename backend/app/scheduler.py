"""Publishes due scheduled posts and refreshes stats every 15 minutes, aligned to the quarter hour."""

from __future__ import annotations

import logging
import threading
import time

from .config import settings
from .social.publisher import run_publisher

log = logging.getLogger("clip2short.scheduler")
_stop = threading.Event()
_started = False


def _loop() -> None:
    period = 15 * 60
    while not _stop.wait(period - (time.time() % period)):
        try:
            r = run_publisher()
            if r["published"] or r["failed"]:
                log.info("published=%s failed=%s stats=%s", r["published"], r["failed"], r["checked"])
        except Exception:
            log.exception("scheduler tick failed")


def start_scheduler() -> None:
    global _started
    if not settings.internal_scheduler or _started:
        return
    _started = True
    first = 15 * 60 - (time.time() % (15 * 60))
    threading.Thread(target=_loop, name="publisher", daemon=True).start()
    log.info("internal publisher armed; first run in %ss", round(first))


def stop_scheduler() -> None:
    _stop.set()
