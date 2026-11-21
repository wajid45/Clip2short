"""Provider interface, shared types and the JSON request helper for platform APIs."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

# Mirrors shared/src/social.ts (labels and limits shown in the web app).
PLATFORMS: dict[str, dict[str, Any]] = {
    "youtube": {"id": "youtube", "label": "YouTube", "maxChars": 5000, "needsImage": False},
    "instagram": {"id": "instagram", "label": "Instagram", "maxChars": 2200, "needsImage": True},
    "facebook": {"id": "facebook", "label": "Facebook", "maxChars": 5000, "needsImage": False},
    "sandbox": {"id": "sandbox", "label": "Sandbox", "maxChars": 5000, "needsImage": False},
}


def platform_length(platform: str, text: str) -> int:
    return len(text)


class PublishError(Exception):
    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


@dataclass
class ConnectedAccount:
    externalId: str
    displayName: str
    accessToken: str
    username: str | None = None
    avatarUrl: str | None = None
    refreshToken: str | None = None
    tokenExpiresAt: datetime | None = None
    meta: dict[str, Any] | None = None


@dataclass
class AccountContext:
    id: str
    externalId: str
    username: str | None
    accessToken: str
    refreshToken: str | None
    tokenExpiresAt: datetime | None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class PublishInput:
    text: str
    link: str
    imageUrl: str | None
    title: str


@dataclass
class PublishResult:
    externalId: str
    liveUrl: str | None
    pending: bool = False  # still processing on the platform; the cron job confirms it later


@dataclass
class Refreshed:
    accessToken: str
    refreshToken: str | None = None
    tokenExpiresAt: datetime | None = None


class Provider:
    id: str = ""
    uses_pkce: bool = False
    refresh_ahead: timedelta = timedelta(minutes=10)  # renew tokens this long before they expire

    def configured(self) -> bool:
        raise NotImplementedError

    def authorize_url(self, *, state: str, redirect_uri: str, code_challenge: str | None = None) -> str:
        raise NotImplementedError

    def exchange(self, *, code: str, redirect_uri: str, code_verifier: str | None = None) -> list[ConnectedAccount]:
        raise NotImplementedError

    def refresh(self, acc: AccountContext) -> Refreshed | None:
        return None

    def publish(self, acc: AccountContext, data: PublishInput) -> PublishResult:
        raise NotImplementedError

    def check_pending(self, acc: AccountContext, external_id: str) -> PublishResult | str | None:
        """None = still pending; str = failure reason; PublishResult = published."""
        return None

    def stats(self, acc: AccountContext, external_id: str) -> dict[str, int | None] | None:
        return None

    @property
    def supports_pending(self) -> bool:
        return type(self).check_pending is not Provider.check_pending


def api(
    url: str,
    *,
    method: str = "GET",
    params: dict[str, str] | None = None,
    form: dict[str, str] | None = None,
    json_body: Any = None,
    headers: dict[str, str] | None = None,
) -> Any:
    """JSON request helper that turns platform error payloads into readable PublishErrors."""
    if params:
        url = f"{url}{'&' if '?' in url else '?'}{urlencode(params)}"
    h = {"Accept": "application/json", **(headers or {})}
    try:
        with httpx.Client(timeout=30) as c:
            res = c.request(method, url, headers=h, data=form, json=json_body)
    except httpx.HTTPError as e:
        raise PublishError(f"Couldn't reach the platform: {e}", True) from None
    text = res.text
    try:
        data = json.loads(text) if text else None
    except json.JSONDecodeError:
        data = {"raw": text[:300]}
    err = data.get("error") if isinstance(data, dict) else None
    if not res.is_success or (isinstance(err, dict) and err.get("code") and err.get("code") != "ok"):
        d = data if isinstance(data, dict) else {}
        e = err if isinstance(err, dict) else {}
        msg = (
            e.get("error_user_msg")
            or e.get("message")
            or d.get("error_description")
            or d.get("detail")
            or d.get("title")
            or (err if isinstance(err, str) else None)
            or ((d.get("errors") or [{}])[0].get("message") if isinstance(d.get("errors"), list) else None)
            or d.get("raw")
            or f"HTTP {res.status_code}"
        )
        raise PublishError(str(msg), res.status_code == 429 or res.status_code >= 500)
    return data


def sleep(seconds: float) -> None:
    time.sleep(seconds)
