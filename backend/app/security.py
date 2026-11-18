"""Sessions (signed JWT cookie), password hashing and token encryption at rest.

All three are compatible with data written by the previous Node backend: existing
sessions, bcrypt hashes and encrypted social tokens keep working.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time

import bcrypt
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Request, Response

from .config import require_secret, settings

SESSION_COOKIE = "sl_session"
MAX_AGE = 60 * 60 * 24 * 30  # 30 days


# ── Sessions ────────────────────────────────────────────────────────────────


def _session_key() -> bytes:
    return require_secret("session_secret").encode()


def set_session(response: Response, user_id: str) -> None:
    now = int(time.time())
    token = jwt.encode({"sub": user_id, "iat": now, "exp": now + MAX_AGE}, _session_key(), algorithm="HS256")
    response.set_cookie(SESSION_COOKIE, token, max_age=MAX_AGE, path="/", httponly=True, secure=settings.is_prod, samesite="lax")


def clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def session_user_id(request: Request) -> str | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, _session_key(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


# ── Passwords ───────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(12)).decode()


_dummy_hash: bytes | None = None


def verify_password(password: str, hashed: str | None) -> bool:
    """Checks a password. Unknown accounts still run bcrypt, so timing doesn't reveal which emails exist."""
    global _dummy_hash
    if not hashed:
        _dummy_hash = _dummy_hash or bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(12))
        bcrypt.checkpw(password.encode()[:72], _dummy_hash)
        return False
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


# ── Encryption (AES-256-GCM, format v1.<iv>.<tag>.<ciphertext>, base64url) ──


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _enc_key() -> bytes:
    return hashlib.sha256(require_secret("encryption_key").encode()).digest()


def encrypt(plain: str) -> str:
    iv = os.urandom(12)
    sealed = AESGCM(_enc_key()).encrypt(iv, plain.encode(), None)
    data, tag = sealed[:-16], sealed[-16:]
    return ".".join(["v1", _b64e(iv), _b64e(tag), _b64e(data)])


def decrypt(payload: str) -> str:
    parts = payload.split(".")
    if len(parts) != 4 or parts[0] != "v1":
        raise ValueError("Unsupported ciphertext")
    _, iv, tag, data = parts
    return AESGCM(_enc_key()).decrypt(_b64d(iv), _b64d(data) + _b64d(tag), None).decode()


def random_token(nbytes: int = 32) -> str:
    return _b64e(secrets.token_bytes(nbytes))


def sha256_base64url(text: str) -> str:
    return _b64e(hashlib.sha256(text.encode()).digest())
