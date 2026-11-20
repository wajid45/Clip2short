"""Account emails sent in the background: welcome, clips ready, credits running low.

They never block or fail the request that triggered them; failures are logged.
"""

from __future__ import annotations

import logging

from .config import settings
from .db import SessionLocal
from .email import send_clips_ready, send_low_credits, send_security_notice, send_welcome
from .models import User
from .plans import TRIAL

log = logging.getLogger("shortlark.notify")

LOW_CREDITS = 30  # warn once the balance drops below this many credits


def _user(user_id: str) -> User | None:
    with SessionLocal() as s:
        u = s.get(User, user_id)
        if u:
            s.expunge(u)
        return u


def welcome(user_id: str) -> None:
    u = _user(user_id)
    if not u:
        return
    try:
        send_welcome(u.email, u.name, f"{settings.app_url}/app", TRIAL["credits"])
    except Exception:
        log.exception("welcome email failed")


def clips_ready(user_id: str, video_id: str, video_title: str, count: int, best: int | None) -> None:
    u = _user(user_id)
    if not u or count <= 0:
        return
    try:
        send_clips_ready(u.email, u.name, video_title, count, best, f"{settings.app_url}/app/videos/{video_id}")
    except Exception:
        log.exception("clips-ready email failed")


def low_credits(user_id: str, balance: int) -> None:
    u = _user(user_id)
    if not u:
        return
    try:
        send_low_credits(u.email, u.name, balance, f"{settings.app_url}/app/billing")
    except Exception:
        log.exception("low-credits email failed")


def password_changed(user_id: str) -> None:
    """Tells the account owner their password changed, so a change they didn't make doesn't go unnoticed."""
    u = _user(user_id)
    if not u:
        return
    try:
        send_security_notice(
            u.email,
            u.name,
            "Your password was changed",
            "The password for your Shortlark account was just changed, and other devices were signed out.",
            f"{settings.app_url}/forgot-password",
        )
    except Exception:
        log.exception("password-changed email failed")


def security_change(user_id: str, title: str, what: str) -> None:
    """Any other change to how the account signs in (two-factor on/off, backup codes)."""
    u = _user(user_id)
    if not u:
        return
    try:
        send_security_notice(u.email, u.name, title, what, f"{settings.app_url}/app/settings")
    except Exception:
        log.exception("security notice failed")


def email_changed(old_email: str, name: str | None, new_email: str) -> None:
    """Sent to the previous address, so a takeover that changes the email is noticed by the real owner."""
    masked = new_email[0] + "***@" + new_email.split("@", 1)[-1]
    try:
        send_security_notice(
            old_email,
            name,
            "Your sign-in email was changed",
            f"The email for your Shortlark account was changed from this address to {masked}.",
            f"{settings.landing_url}/contact",
        )
    except Exception:
        log.exception("email-changed email failed")


def crossed_low(before: int, after: int) -> bool:
    """True the first time a spend takes the balance below the threshold."""
    return before >= LOW_CREDITS > after
