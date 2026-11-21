"""Developer-app credentials for each social network.

Like Buffer or Hootsuite, Clip2Short registers ONE developer app per network; every customer
then just clicks "Connect" and signs in with their own account. An admin enters these
credentials once in Admin → Integrations (stored encrypted), or sets them as environment
variables. Values saved in the app take precedence.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from .db import SessionLocal
from .models import IntegrationSetting
from .odm import select
from .security import decrypt

log = logging.getLogger("clip2short.integrations")

INTEGRATIONS: list[dict[str, Any]] = [
    {
        "id": "google",
        "name": "Google (YouTube)",
        "platforms": ["youtube"],
        "consoleUrl": "https://console.cloud.google.com/apis/credentials",
        "idLabel": "OAuth client ID",
        "secretLabel": "OAuth client secret",
        "env": ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
        "secretOptional": False,
        "steps": [
            "Create a Google Cloud project and enable the YouTube Data API v3.",
            "Configure the OAuth consent screen (External) and add the scope …/auth/youtube.",
            "Create an OAuth client of type “Web application” and add the redirect URI below.",
            "Submit the app for verification and the YouTube API audit. Until then, uploads are forced to private.",
        ],
    },
    {
        "id": "meta",
        "name": "Meta (Facebook Pages)",
        "platforms": ["facebook"],
        "consoleUrl": "https://developers.facebook.com/apps",
        "idLabel": "App ID",
        "secretLabel": "App secret",
        "env": ("META_APP_ID", "META_APP_SECRET"),
        "secretOptional": False,
        "steps": [
            "Create a Business app and add the Facebook Login product.",
            "Add both redirect URIs below to Facebook Login → Valid OAuth Redirect URIs.",
            "Request pages_manage_posts, pages_read_engagement and read_insights in App Review.",
        ],
    },
    {
        "id": "instagram",
        "name": "Instagram (Instagram Login)",
        "platforms": ["instagram"],
        "consoleUrl": "https://developers.facebook.com/apps",
        "idLabel": "Instagram app ID",
        "secretLabel": "Instagram app secret",
        "env": ("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"),
        "secretOptional": False,
        "steps": [
            "In your Meta app, add the Instagram product and choose API setup with Instagram login.",
            "Copy the Instagram app ID and secret from that page (they differ from the Meta App ID).",
            "Under Business login settings, add the redirect URI below as an OAuth redirect URI.",
            "Request instagram_business_basic, instagram_business_content_publish and instagram_business_manage_insights in App Review.",
        ],
    },
]


def integration_for(platform: str) -> dict[str, Any] | None:
    return next((i for i in INTEGRATIONS if platform in i["platforms"]), None)


@dataclass
class Cred:
    source: str  # app | env | none
    id: str | None = None
    secret: str | None = None


_cache: dict[str, tuple[str, str | None]] = {}
_loaded_at = 0.0
_lock = threading.Lock()


def load_integrations(force: bool = False) -> None:
    """Loads admin-entered credentials (cached briefly). Call before any request that uses a provider."""
    global _cache, _loaded_at
    if not force and time.monotonic() - _loaded_at < 30:
        return
    try:
        with SessionLocal() as s:
            rows = s.scalars(select(IntegrationSetting)).all()
        nxt: dict[str, tuple[str, str | None]] = {}
        for r in rows:
            try:
                secret = decrypt(r.clientSecretEnc) if r.clientSecretEnc else None
            except Exception:
                secret = None  # encryption key changed; treat as unset
            nxt[r.id] = (r.clientId, secret)
        with _lock:
            _cache = nxt
            _loaded_at = time.monotonic()
    except Exception:
        log.exception("loading integrations failed")


def _env(name: str) -> str | None:
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else None


def cred(integration_id: str) -> Cred:
    saved = _cache.get(integration_id)
    if saved and saved[0]:
        return Cred("app", saved[0], saved[1])
    info = next(i for i in INTEGRATIONS if i["id"] == integration_id)
    eid = _env(info["env"][0])
    if eid:
        return Cred("env", eid, _env(info["env"][1]))
    return Cred("none")


def is_configured(integration_id: str) -> bool:
    c = cred(integration_id)
    info = next(i for i in INTEGRATIONS if i["id"] == integration_id)
    return bool(c.id and (c.secret or info["secretOptional"]))
