"""Admin portal security: authenticator codes (TOTP), the portal session, and the audit log.

The portal is a separate site (admin/, port 3002) with its own sign-in. Only addresses listed in
ADMIN_EMAILS can sign in, and every sign-in needs the account password *and* a 6-digit code from
an authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator ...).

The portal session is its own cookie (`sl_admin`): short-lived, SameSite=Strict, and separate
from the app's `sl_session`, so being signed in to the app never opens the portal.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

import jwt
from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from .auth import is_admin
from .config import require_secret, settings
from .db import get_db
from .http import HttpError
from .models import AdminAudit, AdminTotp, User

PORTAL_COOKIE = "sl_admin"
PORTAL_MAX_AGE = 60 * 60 * 12  # 12 hours after signing in, sign in again (OWASP ASVS 3.3.2, level 2)
PORTAL_IDLE = 60 * 30  # ...or after 30 minutes without using the console
STEP_SECONDS = 30
ISSUER = "Shortlark Admin"


# ── TOTP (RFC 6238, SHA-1, 6 digits, 30 s): what every authenticator app speaks ──


def new_totp_secret() -> str:
    """160 random bits, base32 without padding (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def totp_now(secret_b32: str, at: float | None = None) -> str:
    return _hotp(secret_b32, int((at if at is not None else time.time()) // STEP_SECONDS))


def match_totp(secret_b32: str, code: str, *, after_step: int = 0, at: float | None = None) -> int | None:
    """The time step the code belongs to (one step of clock drift allowed either way), or None.

    Steps at or before `after_step` are refused, so a code can't be used twice.
    """
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != 6:
        return None
    now_step = int((at if at is not None else time.time()) // STEP_SECONDS)
    for step in (now_step, now_step - 1, now_step + 1):
        if step > after_step and hmac.compare_digest(_hotp(secret_b32, step), code):
            return step
    return None


def otpauth_url(email: str, secret_b32: str, issuer: str = ISSUER) -> str:
    label = quote(f"{issuer}:{email}", safe=":@")
    return f"otpauth://totp/{label}?secret={secret_b32}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period={STEP_SECONDS}"


# ── Portal session ──────────────────────────────────────────────────────────


def _key() -> bytes:
    # Derived from the session secret but distinct, so an app token can never pass as a portal one.
    return hashlib.sha256(b"portal:" + require_secret("session_secret").encode()).digest()


def sign(claims: dict, ttl: int) -> str:
    now = int(time.time())
    return jwt.encode({**claims, "iat": now, "exp": now + ttl}, _key(), algorithm="HS256")


def unsign(token: str | None, typ: str) -> dict | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, _key(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == typ else None


def _portal_token(sub: str, v: int, tv: int, auth_time: int) -> tuple[str, int]:
    """A portal token that lapses after PORTAL_IDLE, and never outlives PORTAL_MAX_AGE from sign-in."""
    ttl = max(0, min(PORTAL_IDLE, auth_time + PORTAL_MAX_AGE - int(time.time())))
    return sign({"typ": "portal", "sub": sub, "v": v, "tv": tv, "at": auth_time}, ttl), ttl


def write_portal_cookie(response: Response, token: str, ttl: int) -> None:
    response.set_cookie(PORTAL_COOKIE, token, max_age=ttl, path="/", httponly=True, secure=settings.is_prod, samesite="strict")


def set_portal_session(response: Response, user: User, totp: AdminTotp) -> None:
    write_portal_cookie(response, *_portal_token(user.id, user.sessionVersion, totp.sessionVersion, int(time.time())))


def clear_portal_session(response: Response) -> None:
    response.delete_cookie(PORTAL_COOKIE, path="/")


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else "")


def check_ip(request: Request) -> None:
    """ADMIN_ALLOWED_IPS (comma-separated) limits the portal API to those addresses when set."""
    allowed = settings.admin_allowed_ips
    if allowed and client_ip(request) not in allowed:
        raise HttpError(404, "Not found.")


def require_portal_admin(request: Request, s: Session = Depends(get_db)) -> User:
    """The admin behind a valid portal session. Anything else is a plain 401 (never a hint that the portal exists)."""
    check_ip(request)
    claims = unsign(request.cookies.get(PORTAL_COOKIE), "portal")
    user = s.get(User, claims["sub"]) if claims else None
    totp = s.get(AdminTotp, user.id) if user else None
    if (
        not claims
        or not user
        or not is_admin(user)
        or user.suspendedAt is not None
        or claims.get("v", 0) != user.sessionVersion
        or not totp
        or not totp.secretEnc
        or claims.get("tv", 0) != totp.sessionVersion
    ):
        raise HttpError(401, "Your admin session has ended. Sign in again.", "unauthenticated")
    # Activity slides the idle timeout forward; background refreshes (X-Background: 1) don't count.
    if request.headers.get("x-background") != "1":
        auth_time = claims.get("at") if isinstance(claims.get("at"), int) else claims.get("iat", 0)
        request.state.portal_cookie = _portal_token(user.id, user.sessionVersion, totp.sessionVersion, auth_time)
    return user


def audit(s: Session, request: Request, admin: User | None, action: str, *, target: str | None = None, detail: str | None = None, email: str | None = None) -> None:
    s.add(
        AdminAudit(
            adminId=admin.id if admin else None,
            adminEmail=(admin.email if admin else email) or "",
            action=action,
            targetUserId=target,
            detail=(detail or "")[:500] or None,
            ip=client_ip(request)[:64] or None,
        )
    )
    s.commit()
