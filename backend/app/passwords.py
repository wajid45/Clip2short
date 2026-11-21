"""Password policy and hashing, following NIST SP 800-63B and OWASP ASVS (V2 / V6).

Policy for passwords people choose (sign-up, reset, change):
- 12 to 128 characters, any characters including spaces and emoji; no composition rules
  ("one uppercase, one symbol") and no forced expiry, which both standards advise against.
- Compared after Unicode NFKC normalisation, so the same password typed on different
  keyboards matches.
- Refused when it is a common password, built from the site name or the person's own
  email/name, a run of one character, or found in a known data breach (Have I Been Pwned,
  k-anonymity: only the first 5 characters of the SHA-1 hash leave the server).

Hashing: bcrypt (cost 12) over a SHA-256 digest of the normalised password, so the whole
password counts (plain bcrypt ignores everything after 72 bytes). Older hashes still verify and
are upgraded the next time that person signs in.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import re
import unicodedata

import bcrypt
import httpx

from .config import settings

log = logging.getLogger("clip2short.passwords")

MIN_LENGTH = 12
MAX_LENGTH = 128
_V2 = "$sl2$"

# The most common passwords and keyboard walks that meet the length rule (plus their stems),
# from public breach-frequency lists. The breach check below catches the long tail.
_COMMON = {
    "123456789012", "1234567890123", "12345678901234", "123456123456", "123123123123", "111111111111",
    "000000000000", "123412341234", "987654321098", "qwertyuiopas", "qwertyuiop123", "qwerty123456",
    "qwertyqwerty", "1q2w3e4r5t6y", "1qaz2wsx3edc", "zaq12wsxcde3", "asdfghjkl123", "zxcvbnm12345",
    "passwordpassword", "password1234", "password12345", "password123456", "password123!", "password!123",
    "passw0rd1234", "p@ssword1234", "p@ssw0rd1234", "letmein12345", "letmein123456", "welcome12345",
    "welcome123456", "welcome2024!", "welcome2025!", "welcome2026!", "iloveyou1234", "iloveyou12345",
    "admin1234567", "administrator", "administrator1", "changeme1234", "changemenow!", "trustno11234",
    "football1234", "baseball1234", "basketball12", "superman1234", "batman123456", "princess1234",
    "sunshine1234", "monkey123456", "dragon123456", "master123456", "shadow123456", "michael12345",
    "jennifer1234", "starwars1234", "pokemon12345", "minecraft123", "fortnite1234", "youtube12345",
    "instagram123", "facebook1234", "google123456", "computer1234", "internet1234", "abcdefghijkl",
    "abcdef123456", "abc123abc123", "aaaaaaaaaaaa", "mypassword12", "mypassword123", "secretpassword",
    "summer2024!!", "summer2025!!", "winter2025!!", "spring2026!!", "autumn2025!!", "december2025",
    "january2026!", "correcthorsebatterystaple", "thisismypassword", "letmeinplease", "iloveyouforever",
}
_COMMON_STEMS = {st for c in _COMMON if len(st := re.sub(r"[^a-z]", "", c)) >= 6}
_SITE_WORDS = ("clip2short", "clipflow")


def normalize(password: str) -> str:
    return unicodedata.normalize("NFKC", password)


def _stem(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def _breached(password: str) -> bool:
    """True when the password appears in Have I Been Pwned. Fails open: a network problem never blocks sign-up."""
    if not settings.password_breach_check:
        return False
    digest = hashlib.sha1(password.encode()).hexdigest().upper()  # noqa: S324 - required by the HIBP range API
    prefix, suffix = digest[:5], digest[5:]
    try:
        res = httpx.get(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            headers={"Add-Padding": "true", "User-Agent": "Clip2Short-password-check"},
            timeout=3,
        )
        res.raise_for_status()
    except httpx.HTTPError:
        log.warning("breached-password check unavailable; allowing the password")
        return False
    for line in res.text.splitlines():
        found, _, count = line.partition(":")
        if found.strip() == suffix and count.strip() not in ("", "0"):
            return True
    return False


def password_problem(password: str, *, email: str = "", name: str | None = None) -> str | None:
    """Why this new password can't be used, in words for the person choosing it, or None if it's fine."""
    pw = normalize(password)
    if len(pw) < MIN_LENGTH:
        return f"Use at least {MIN_LENGTH} characters. A short phrase of a few words is easy to remember."
    if len(pw) > MAX_LENGTH:
        return f"Use at most {MAX_LENGTH} characters."
    lowered = pw.lower()
    if len(set(lowered)) <= 2:
        return "That password is too easy to guess. Try a few unrelated words."
    stem = _stem(pw)
    if lowered in _COMMON or stem in _COMMON_STEMS:
        return "That's one of the most common passwords. Choose something less predictable."
    # Stem the site words too, so a name with digits like "clip2short" still matches "clipshort".
    context = [*(_stem(w) for w in _SITE_WORDS), _stem(email.split("@", 1)[0]), *(_stem(p) for p in (name or "").split())]
    leftover = stem
    for word in context:
        if len(word) >= 4:
            leftover = leftover.replace(word, "")
    if stem and len(leftover) < 4:
        return "Don't build your password from your name, your email or Clip2Short."
    if _breached(pw):
        return "That password has appeared in a data breach, so attackers try it first. Choose a different one."
    return None


# ── Hashing ─────────────────────────────────────────────────────────────────


def _prehash(password: str) -> bytes:
    return base64.b64encode(hashlib.sha256(normalize(password).encode()).digest())


def hash_password(password: str) -> str:
    return _V2 + bcrypt.hashpw(_prehash(password), bcrypt.gensalt(12)).decode()


_dummy_hash: bytes | None = None


def verify_password(password: str, hashed: str | None) -> bool:
    """Checks a password. Unknown accounts still run bcrypt, so timing doesn't reveal which emails exist."""
    global _dummy_hash
    if not hashed:
        _dummy_hash = _dummy_hash or bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(12))
        bcrypt.checkpw(_prehash(password), _dummy_hash)
        return False
    try:
        if hashed.startswith(_V2):
            return bcrypt.checkpw(_prehash(password), hashed[len(_V2) :].encode())
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())  # hashes from before $sl2$
    except ValueError:
        return False


def needs_rehash(hashed: str) -> bool:
    return not hashed.startswith(_V2)
