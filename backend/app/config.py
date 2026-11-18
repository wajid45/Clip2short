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


@dataclass(frozen=True)
class Settings:
    app_url: str = _url("APP_URL", "http://localhost:3000")
    """Public URL of the web app (OAuth redirects, Stripe return URLs). The API is served from the same origin."""
    landing_url: str = _url("LANDING_URL", "http://localhost:3001")
    """Public URL of the marketing site; allowed to call the public lead API (CORS)."""
    port: int = int(_opt("PORT") or 4000)
    trust_proxy: bool = _opt("TRUST_PROXY") == "true"
    web_dist: str | None = _opt("WEB_DIST")
    is_prod: bool = (_opt("ENV") or _opt("NODE_ENV") or "development") == "production"
    database_url: str = _opt("DATABASE_URL") or f"sqlite:///{(BACKEND_DIR / 'data' / 'dev.db').as_posix()}"

    session_secret: str | None = _opt("SESSION_SECRET")
    encryption_key: str | None = _opt("ENCRYPTION_KEY")
    cron_secret: str | None = _opt("CRON_SECRET")
    admin_emails: tuple[str, ...] = tuple(s.strip().lower() for s in (_opt("ADMIN_EMAILS") or "").split(",") if s.strip())

    anthropic_key: str | None = _opt("ANTHROPIC_API_KEY")
    anthropic_model: str = _opt("ANTHROPIC_MODEL") or "claude-opus-5-5"

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


def require_secret(name: str) -> str:
    v = getattr(settings, name)
    if v:
        return v
    if settings.is_prod:
        raise RuntimeError(f"Missing required environment variable for {name}")
    # Deterministic development fallback so local sessions survive restarts. Never used in production.
    camel = "".join(w if i == 0 else w.capitalize() for i, w in enumerate(name.split("_")))
    return f"dev-only-{camel}-change-me-in-production-0123456789abcdef"
