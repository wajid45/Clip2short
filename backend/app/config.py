"""Central, typed access to environment configuration.

Optional integrations (Stripe, social networks, Anthropic) report whether they are
configured so the UI can explain what is missing instead of failing late.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _opt(name: str) -> str | None:
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else None


def _url(name: str, default: str) -> str:
    return (_opt(name) or default).rstrip("/")


def _parse_prices(raw: str | None) -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for part in (raw or "").replace(",", ";").split(";"):
        model, _, prices = part.partition("=")
        inp, _, outp = prices.partition("/")
        try:
            if model.strip() and inp.strip() and outp.strip():
                out[model.strip()] = (float(inp), float(outp))
        except ValueError:
            continue
    return out


@dataclass(frozen=True)
class Settings:
    app_url: str = _url("APP_URL", "http://localhost:3000")
    """Public URL of the web app (OAuth redirects, Stripe return URLs). The API is served from the same origin."""
    landing_url: str = _url("LANDING_URL", "http://localhost:3001")
    admin_url: str = _url("ADMIN_URL", "http://localhost:3002")
    """Public URL of the marketing site; allowed to call the public lead API (CORS)."""
    port: int = int(_opt("PORT") or 4000)
    trust_proxy: bool = _opt("TRUST_PROXY") == "true"
    web_dist: str | None = _opt("WEB_DIST")
    is_prod: bool = (_opt("ENV") or _opt("NODE_ENV") or "development") == "production"
    # MongoDB (Atlas or self-hosted). A <db_password> / <db_username> placeholder in the URI is filled from
    # MONGODB_PASSWORD / MONGODB_USERNAME. "mongomock://" runs an in-memory database (tests).
    mongodb_uri: str = _opt("MONGODB_URI") or "mongodb://localhost:27017"
    mongodb_db: str = _opt("MONGODB_DB") or "shortlark"

    session_secret: str | None = _opt("SESSION_SECRET")
    encryption_key: str | None = _opt("ENCRYPTION_KEY")
    cron_secret: str | None = _opt("CRON_SECRET")
    admin_emails: tuple[str, ...] = tuple(s.strip().lower() for s in (_opt("ADMIN_EMAILS") or "").split(",") if s.strip())
    # Admin portal: when set, only these client IPs may call /api/portal/* (comma-separated).
    # Refuse new passwords found in known data breaches (Have I Been Pwned range API). On unless "false".
    password_breach_check: bool = _opt("PASSWORD_BREACH_CHECK") != "false"
    admin_allowed_ips: tuple[str, ...] = tuple(s.strip() for s in (_opt("ADMIN_ALLOWED_IPS") or "").split(",") if s.strip())

    gemini_key: str | None = _opt("GEMINI_API_KEY") or _opt("GOOGLE_API_KEY")
    gemini_model: str = _opt("GEMINI_MODEL") or "gemini-3.8-flash"
    """Google AI Studio model id; see https://ai.google.dev/gemini-api/docs/models"""
    # One model per video category (app/ai/engines.py); any left empty falls back to GEMINI_MODEL.
    gemini_category_models: dict[str, str] = field(
        default_factory=lambda: {c: m for c in ("podcast", "gaming", "movies", "sports", "other") if (m := _opt(f"GEMINI_MODEL_{c.upper()}"))}
    )

    # Gemini prices for the admin's AI spending cards, US dollars per million tokens (input/output):
    # GEMINI_PRICES="model-a=0.30/2.50; model-b=1.25/10". Models left out are counted but not priced.
    gemini_prices: dict[str, tuple[float, float]] = field(default_factory=lambda: _parse_prices(_opt("GEMINI_PRICES")))

    resend_key: str | None = _opt("RESEND_API_KEY")
    email_from: str = _opt("EMAIL_FROM") or "Clip2Short <no-reply@clip2short.com>"

    stripe_secret: str | None = _opt("STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = _opt("STRIPE_WEBHOOK_SECRET")
    stripe_prices: dict[str, str | None] = field(
        default_factory=lambda: {
            "creator": _opt("STRIPE_PRICE_CREATOR"),
            "pro": _opt("STRIPE_PRICE_PRO"),
            "studio": _opt("STRIPE_PRICE_STUDIO"),
        }
    )

    social_sandbox_flag: str | None = _opt("SOCIAL_SANDBOX")
    internal_scheduler: bool = _opt("INTERNAL_SCHEDULER") != "false"
    """Runs the 15-minute publisher inside the API process. Set to "false" when an external cron calls /api/cron/publish."""
    ffmpeg_path: str | None = _opt("FFMPEG_PATH")

    @property
    def social_sandbox(self) -> bool:
        """Sandbox social accounts simulate publishing; never on in production unless explicitly enabled."""
        return self.social_sandbox_flag == "true" or (not self.is_prod and self.social_sandbox_flag != "false")


settings = Settings()


def billing_configured() -> bool:
    return bool(settings.stripe_secret and all(settings.stripe_prices.values()))


def dev_billing_bypass() -> bool:
    """In local development without Stripe keys, plans and packs are granted directly for testing."""
    return not settings.is_prod and not billing_configured()


MIN_SECRET_LENGTH = 32


def _local_app() -> bool:
    from urllib.parse import urlsplit

    return (urlsplit(settings.app_url).hostname or "") in ("localhost", "127.0.0.1", "::1") or (urlsplit(settings.app_url).hostname or "").endswith(".localhost")


def require_secret(name: str) -> str:
    v = getattr(settings, name)
    env = name.upper()
    if v:
        if (settings.is_prod or not _local_app()) and len(v) < MIN_SECRET_LENGTH:
            raise RuntimeError(f"{env} is too short: use at least {MIN_SECRET_LENGTH} random characters (python -c \"import secrets; print(secrets.token_urlsafe(48))\")")
        return v
    if settings.is_prod or not _local_app():
        # The fallback below is public in the source code: on a real address it would let anyone forge sessions.
        raise RuntimeError(f"Missing required environment variable {env}")
    # Deterministic development fallback so local sessions survive restarts. Never used in production.
    camel = "".join(w if i == 0 else w.capitalize() for i, w in enumerate(name.split("_")))
    return f"dev-only-{camel}-change-me-in-production-0123456789abcdef"
