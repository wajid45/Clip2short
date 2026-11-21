"""Optional two-factor sign-in for app users (NIST SP 800-63B AAL2, OWASP ASVS V2.8 / V6.5).

Off until the person turns it on in Settings. Once on, signing in takes the password and then a
6-digit code from an authenticator app, or one of ten single-use backup codes for a lost phone.

Flow: POST /auth/login answers {"step": "code", "challenge": ...} instead of setting the session;
POST /auth/login/code exchanges that short-lived challenge plus a code for the session.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

import jwt
from fastapi import Depends, Request

from .. import notify
from ..auth import require_user
from ..background import after
from ..config import require_secret
from ..db import get_db, utcnow
from ..http import HttpError, json_response, validate
from ..models import User, UserTwoFactor
from ..odm import Session
from ..portal import match_totp, new_totp_secret, otpauth_url
from ..ratelimit import rate_limit, rate_limit_account
from ..security import decrypt, encrypt, set_session, verify_password
from .common import JsonBody, Model, api_router, text

router = api_router()

ISSUER = "Clip2Short"
CHALLENGE_TTL = 5 * 60  # minutes to type the code after the password
RECOVERY_CODES = 10
BAD_CODE = "That code doesn't match. Use the newest code from your authenticator app, or a backup code."


# ── Helpers ─────────────────────────────────────────────────────────────────


def enabled_2fa(s: Session, user_id: str) -> UserTwoFactor | None:
    row = s.get(UserTwoFactor, user_id)
    return row if row and row.secretEnc else None


def _key() -> bytes:
    # Distinct from the session key, so a challenge can never pass as a session.
    return hashlib.sha256(b"2fa-challenge:" + require_secret("session_secret").encode()).digest()


def make_challenge(user: User) -> str:
    now = int(time.time())
    return jwt.encode({"typ": "2fa", "sub": user.id, "v": user.sessionVersion, "iat": now, "exp": now + CHALLENGE_TTL}, _key(), algorithm="HS256")


def _read_challenge(token: str) -> dict | None:
    try:
        claims = jwt.decode(token, _key(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == "2fa" else None


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _clean(code: str) -> str:
    return "".join(ch for ch in code.lower() if ch.isalnum())


def new_recovery_codes() -> tuple[list[str], str]:
    """Ten codes like `k7m2q-p9x4w` (50 random bits each) and the stored hashes."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i
    codes = ["".join(secrets.choice(alphabet) for _ in range(10)) for _ in range(RECOVERY_CODES)]
    shown = [f"{c[:5]}-{c[5:]}" for c in codes]
    return shown, " ".join(_hash_code(c) for c in codes)


def check_code(row: UserTwoFactor, code: str) -> str | None:
    """'totp' or 'recovery' when the code is good (and spends it), else None."""
    digits = "".join(ch for ch in code if ch.isdigit())
    if len(digits) == 6 and len(_clean(code)) == 6:
        step = match_totp(decrypt(row.secretEnc or ""), digits, after_step=row.lastStep)
        if step is not None:
            row.lastStep = step
            return "totp"
        return None
    wanted = _hash_code(_clean(code))
    hashes = row.recoveryHashes.split()
    for h in hashes:
        if hmac.compare_digest(h, wanted):
            hashes.remove(h)
            row.recoveryHashes = " ".join(hashes)
            return "recovery"
    return None


def status(s: Session, user_id: str) -> dict:
    row = enabled_2fa(s, user_id)
    return {"enabled": bool(row), "enabledAt": row.enabledAt if row else None, "backupCodesLeft": len(row.recoveryHashes.split()) if row else 0}


# ── Sign-in, second step ────────────────────────────────────────────────────


class LoginCode(Model):
    challenge: text(10, 2000)  # type: ignore[valid-type]
    code: text(1, 40, min_msg="Enter the code")  # type: ignore[valid-type]


@router.post("/auth/login/code")
def login_code(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "login-code", 20, 15 * 60)
    b = validate(LoginCode, body)
    claims = _read_challenge(b.challenge)
    if not claims:
        raise HttpError(400, "That took too long. Enter your password again.", "challenge_expired")
    rate_limit_account("login-code", claims["sub"], 5, 15 * 60)  # 5 guesses per 15 minutes per account
    user = s.get(User, claims["sub"])
    row = enabled_2fa(s, claims["sub"])
    if not user or user.suspendedAt is not None or claims.get("v") != user.sessionVersion or not row:
        raise HttpError(400, "That took too long. Enter your password again.", "challenge_expired")
    used = check_code(row, b.code)
    if not used:
        s.commit()
        raise HttpError(401, BAD_CODE, "bad_code")
    s.commit()
    res = json_response({"ok": True, "backupCodesLeft": len(row.recoveryHashes.split()) if used == "recovery" else None})
    set_session(res, user.id, user.sessionVersion)
    if used == "recovery":
        after(notify.security_change, user.id, "A backup code was used to sign in", "One of your two-factor backup codes was just used to sign in to Clip2Short.")
    return res


# ── Settings ────────────────────────────────────────────────────────────────


class Password(Model):
    password: text(1, 1024, min_msg="Enter your password", strip=False)  # type: ignore[valid-type]


class Code(Model):
    code: text(1, 40, min_msg="Enter the code")  # type: ignore[valid-type]


class PasswordAndCode(Model):
    password: text(1, 1024, min_msg="Enter your password", strip=False)  # type: ignore[valid-type]
    code: text(1, 40, min_msg="Enter a code from your authenticator app or a backup code")  # type: ignore[valid-type]


def _check_password(request: Request, user: User, password: str) -> None:
    rate_limit(request, f"2fa-settings:{user.id}", 10, 15 * 60)
    if not verify_password(password, user.passwordHash):
        raise HttpError(400, "Your password isn't right.", "wrong_password")


@router.get("/account/2fa")
def get_status(user: User = Depends(require_user), s: Session = Depends(get_db)):
    return json_response(status(s, user.id))


@router.post("/account/2fa/start")
def start(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Step 1 of turning it on: a new secret to scan. Nothing changes until a code from it is confirmed."""
    b = validate(Password, body)
    _check_password(request, user, b.password)
    if enabled_2fa(s, user.id):
        raise HttpError(409, "Two-factor sign-in is already on.")
    row = s.get(UserTwoFactor, user.id) or UserTwoFactor(userId=user.id)
    secret = new_totp_secret()
    row.pendingSecretEnc = encrypt(secret)
    s.add(row)
    s.commit()
    return json_response({"secret": secret, "otpauthUrl": otpauth_url(user.email, secret, ISSUER)})


@router.post("/account/2fa/confirm")
def confirm(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Step 2: a code from the new authenticator turns it on and returns the backup codes (shown once)."""
    rate_limit(request, f"2fa-settings:{user.id}", 10, 15 * 60)
    b = validate(Code, body)
    row = s.get(UserTwoFactor, user.id)
    if not row or not row.pendingSecretEnc or row.secretEnc:
        raise HttpError(400, "Start again: enter your password to get a new QR code.", "not_started")
    step = match_totp(decrypt(row.pendingSecretEnc), b.code)
    if step is None:
        raise HttpError(400, "That code doesn't match. Check the time on your phone and try the newest code.", "bad_code")
    shown, hashes = new_recovery_codes()
    row.secretEnc, row.pendingSecretEnc, row.enabledAt, row.lastStep, row.recoveryHashes = row.pendingSecretEnc, None, utcnow(), step, hashes
    user.sessionVersion += 1  # sessions on other devices end: they signed in without the second step
    s.commit()
    after(notify.security_change, user.id, "Two-factor sign-in is on", "Two-factor sign-in was turned on for your Clip2Short account. Signing in now also needs a code from your authenticator app.")
    res = json_response({"ok": True, "backupCodes": shown})
    set_session(res, user.id, user.sessionVersion)
    return res


@router.post("/account/2fa/disable")
def disable(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    b = validate(PasswordAndCode, body)
    _check_password(request, user, b.password)
    row = enabled_2fa(s, user.id)
    if not row:
        raise HttpError(409, "Two-factor sign-in is already off.")
    if not check_code(row, b.code):
        s.commit()
        raise HttpError(400, BAD_CODE, "bad_code")
    s.delete(row)
    s.commit()
    after(notify.security_change, user.id, "Two-factor sign-in is off", "Two-factor sign-in was turned off for your Clip2Short account. Signing in now needs only your password.")
    return json_response({"ok": True})


@router.post("/account/2fa/backup-codes")
def regenerate(request: Request, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """New backup codes; the old ones stop working."""
    b = validate(PasswordAndCode, body)
    _check_password(request, user, b.password)
    row = enabled_2fa(s, user.id)
    if not row:
        raise HttpError(409, "Turn on two-factor sign-in first.")
    if not check_code(row, b.code):
        s.commit()
        raise HttpError(400, BAD_CODE, "bad_code")
    shown, row.recoveryHashes = new_recovery_codes()
    s.commit()
    after(notify.security_change, user.id, "New backup codes", "New two-factor backup codes were created for your Clip2Short account. The old ones no longer work.")
    return json_response({"ok": True, "backupCodes": shown})
