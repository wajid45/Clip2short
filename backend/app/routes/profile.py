"""Password reset, account settings (profile, password, delete) and the contact form."""

import hashlib
import logging
from datetime import timedelta
from typing import Literal

from fastapi import Depends, Request

from .. import notify
from ..auth import require_user
from ..background import after
from ..billing import stripe_client
from ..config import settings
from ..db import get_db, utcnow
from ..email import send_password_reset
from ..http import HttpError, json_response, validate
from ..models import ContactMessage, PasswordReset, User
from ..odm import Session, select, update
from ..passwords import MAX_LENGTH, password_problem
from ..ratelimit import rate_limit, rate_limit_account
from ..security import clear_session, hash_password, random_token, set_session, verify_password
from .common import JsonBody, Model, api_router, email, text
from .two_factor import check_code, enabled_2fa

log = logging.getLogger("clip2short.account")
router = api_router()

RESET_MINUTES = 60


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── Forgot / reset password ─────────────────────────────────────────────────


class Forgot(Model):
    email: email("Enter a valid email")  # type: ignore[valid-type]


@router.post("/auth/forgot")
def forgot_password(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    """Emails a one-time reset link.

    Answers the same way, at the same speed, whether or not the email has an account: the email is
    sent in the background and a sending failure is only logged, so nothing reveals who signed up.
    """
    rate_limit(request, "forgot", 5, 15 * 60)
    b = validate(Forgot, body)
    rate_limit_account("forgot", b.email, 3, 60 * 60)  # no inbox gets more than 3 reset emails an hour
    user = s.scalar(select(User).where(User.email == b.email))
    if user:
        token = random_token(32)
        s.add(PasswordReset(userId=user.id, tokenHash=_hash(token), expiresAt=utcnow() + timedelta(minutes=RESET_MINUTES)))
        s.commit()
        after(_send_reset, user.email, user.name, f"{settings.app_url}/reset-password?token={token}")
    return json_response({"ok": True})


def _send_reset(to: str, name: str | None, link: str) -> None:
    try:
        send_password_reset(to, name, link, RESET_MINUTES)
    except Exception:
        log.exception("password reset email failed")


class Reset(Model):
    token: text(10, 200)  # type: ignore[valid-type]
    password: text(1, MAX_LENGTH * 4, strip=False)  # type: ignore[valid-type]


def _valid_reset(s: Session, token: str) -> PasswordReset:
    row = s.scalar(select(PasswordReset).where(PasswordReset.tokenHash == _hash(token)))
    if not row or row.usedAt or row.expiresAt < utcnow():
        raise HttpError(400, "This reset link has expired or was already used. Ask for a new one.", "invalid_token")
    return row


@router.get("/auth/reset")
def check_reset(token: str = "", s: Session = Depends(get_db)):
    """Lets the reset page say up front when a link is no longer valid."""
    _valid_reset(s, token)
    return json_response({"ok": True})


@router.post("/auth/reset")
def reset_password(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "reset", 10, 15 * 60)
    b = validate(Reset, body)
    row = _valid_reset(s, b.token)
    user = s.get(User, row.userId)
    if not user:
        raise HttpError(400, "This reset link has expired or was already used. Ask for a new one.", "invalid_token")
    if problem := password_problem(b.password, email=user.email, name=user.name):
        raise HttpError(400, problem, "weak_password")
    now = utcnow()
    # Claim the link first: only one request can turn usedAt from empty to set.
    claimed = s.execute(update(PasswordReset).where(PasswordReset.id == row.id, PasswordReset.usedAt.is_(None)).values(usedAt=now))
    if claimed.rowcount != 1:
        s.rollback()
        raise HttpError(400, "This reset link has expired or was already used. Ask for a new one.", "invalid_token")
    user.passwordHash = hash_password(b.password)
    user.sessionVersion += 1  # sign out every other session
    s.execute(update(PasswordReset).where(PasswordReset.userId == user.id, PasswordReset.usedAt.is_(None)).values(usedAt=now))
    s.commit()
    after(notify.password_changed, user.id)
    if enabled_2fa(s, user.id):
        # An emailed link proves the inbox, not the phone: two-factor accounts sign in again with their code.
        return json_response({"ok": True, "signIn": True})
    res = json_response({"ok": True})
    set_session(res, user.id, user.sessionVersion)
    return res


# ── Account settings ─────────────────────────────────────────────────────────


class Profile(Model):
    name: text(1, 80, min_msg="Enter your name")  # type: ignore[valid-type]
    email: email("Enter a valid email")  # type: ignore[valid-type]
    currentPassword: str | None = None  # required when the email changes
    code: str | None = None  # also required when two-factor sign-in is on


@router.patch("/account")
def update_profile(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    b = validate(Profile, body)
    old_email = user.email
    if b.email != user.email:
        rate_limit(request, f"email-change:{user.id}", 10, 15 * 60)
        if not verify_password(b.currentPassword or "", user.passwordHash):
            raise HttpError(400, "Enter your current password to change your email.", "password_required")
        if two_factor := enabled_2fa(s, user.id):
            if not b.code:
                raise HttpError(400, "Enter a code from your authenticator app to change your email.", "code_required")
            if not check_code(two_factor, b.code):
                s.commit()  # keep the replay guard
                raise HttpError(400, "That code doesn't match. Use the newest code from your authenticator app, or a backup code.", "bad_code")
        if s.scalar(select(User.id).where(User.email == b.email, User.id != user.id)):
            raise HttpError(409, "Another account already uses that email.")
        user.email = b.email
    user.name = b.name
    s.commit()
    if old_email != user.email:
        after(notify.email_changed, old_email, user.name, user.email)  # the old address hears about it
    return json_response({"ok": True, "name": user.name, "email": user.email})


class ChangePassword(Model):
    currentPassword: text(0, 1024, strip=False)  # type: ignore[valid-type]
    newPassword: text(1, MAX_LENGTH * 4, strip=False)  # type: ignore[valid-type]


@router.post("/account/password")
def change_password(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    rate_limit(request, f"password:{user.id}", 10, 15 * 60)
    b = validate(ChangePassword, body)
    if not verify_password(b.currentPassword, user.passwordHash):
        raise HttpError(400, "Your current password isn't right.", "wrong_password")
    if problem := password_problem(b.newPassword, email=user.email, name=user.name):
        raise HttpError(400, problem, "weak_password")
    user.passwordHash = hash_password(b.newPassword)
    user.sessionVersion += 1  # other devices are signed out; this one stays signed in
    s.commit()
    after(notify.password_changed, user.id)
    res = json_response({"ok": True})
    set_session(res, user.id, user.sessionVersion)
    return res


class DeleteAccount(Model):
    password: str
    confirm: Literal["DELETE"]


@router.delete("/account")
def delete_account(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Deletes the account and everything in it. An active subscription is canceled first."""
    rate_limit(request, f"delete:{user.id}", 5, 15 * 60)
    try:
        b = validate(DeleteAccount, body)
    except HttpError:
        raise HttpError(400, "Type DELETE to confirm.") from None
    if not verify_password(b.password, user.passwordHash):
        raise HttpError(400, "Your password isn't right.", "wrong_password")
    if user.stripeSubscriptionId and settings.stripe_secret:
        try:
            stripe_client().v1.subscriptions.cancel(user.stripeSubscriptionId)
        except Exception:
            log.exception("canceling the subscription failed")
            raise HttpError(502, "We couldn't cancel your subscription with Stripe. Please try again or contact support.") from None
    s.delete(user)
    s.commit()
    res = json_response({"ok": True})
    clear_session(res)
    return res


# ── Contact form (landing site) ─────────────────────────────────────────────


class Contact(Model):
    name: text(1, 100, min_msg="Enter your name")  # type: ignore[valid-type]
    email: email("Enter a valid email address")  # type: ignore[valid-type]
    topic: Literal["general", "sales", "support", "billing", "partnership", "legal"] = "general"
    message: text(10, 5000, min_msg="Write a little more so we can help")  # type: ignore[valid-type]
    website: str | None = None  # honeypot


@router.post("/contact")
def contact(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "contact", 5, 15 * 60)
    b = validate(Contact, body)
    if b.website:
        return json_response({"ok": True})  # silently drop bots
    s.add(ContactMessage(name=b.name, email=b.email, topic=b.topic, message=b.message, userAgent=(request.headers.get("user-agent") or "")[:300] or None))
    s.commit()
    return json_response({"ok": True})

