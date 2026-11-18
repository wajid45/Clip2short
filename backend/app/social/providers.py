"""Provider registry, connected-account storage and token refresh."""

from __future__ import annotations

import json
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import utcnow
from ..integrations import load_integrations
from ..models import SocialAccount
from ..security import decrypt, encrypt
from .base import AccountContext, ConnectedAccount, Provider
from .meta import Facebook, Instagram
from .sandbox import Sandbox
from .youtube import YouTube

PROVIDERS: dict[str, Provider] = {"youtube": YouTube(), "instagram": Instagram(), "facebook": Facebook(), "sandbox": Sandbox()}


def get_provider(platform: str) -> Provider | None:
    return PROVIDERS.get(platform)


def redirect_uri_for(platform: str) -> str:
    return f"{settings.app_url}/api/social/callback/{platform}"


def finish_url(popup: bool, ok: bool, message: str) -> str:
    """Where to land after a sign-in flow: the popup closer page, or the accounts page."""
    from urllib.parse import quote

    q = f"{'connected' if ok else 'error'}={quote(message, safe='')}"
    return f"{settings.app_url}/oauth/complete?{q}" if popup else f"{settings.app_url}/app/accounts?{q}"


def save_accounts(s: Session, user_id: str, platform: str, accounts: list[ConnectedAccount]) -> None:
    for a in accounts:
        row = s.scalar(
            select(SocialAccount).where(SocialAccount.userId == user_id, SocialAccount.platform == platform, SocialAccount.externalId == a.externalId)
        )
        if row is None:
            row = SocialAccount(userId=user_id, platform=platform, externalId=a.externalId)
            s.add(row)
        row.displayName = a.displayName
        row.username = a.username
        row.avatarUrl = a.avatarUrl
        row.accessTokenEnc = encrypt(a.accessToken)
        row.refreshTokenEnc = encrypt(a.refreshToken) if a.refreshToken else None
        row.tokenExpiresAt = a.tokenExpiresAt
        row.metaJson = json.dumps(a.meta) if a.meta else None
        row.status = "active"
    s.commit()


def _to_context(a: SocialAccount) -> AccountContext:
    try:
        access = decrypt(a.accessTokenEnc)
        refresh = decrypt(a.refreshTokenEnc) if a.refreshTokenEnc else None
    except Exception:
        # Stored token can't be read (e.g. ENCRYPTION_KEY changed): the user must sign in again.
        raise RuntimeError("This account's sign-in is no longer valid. Reconnect it on the Social accounts page.") from None
    return AccountContext(
        id=a.id,
        externalId=a.externalId,
        username=a.username,
        accessToken=access,
        refreshToken=refresh,
        tokenExpiresAt=a.tokenExpiresAt,
        meta=json.loads(a.metaJson) if a.metaJson else {},
    )


def account_context(s: Session, a: SocialAccount) -> AccountContext:
    """A usable token context, refreshed first if it expires within 10 minutes."""
    load_integrations()
    ctx = _to_context(a)
    provider = get_provider(a.platform)
    if provider and a.tokenExpiresAt and a.tokenExpiresAt - utcnow() < timedelta(minutes=10):
        try:
            r = provider.refresh(ctx)
            if r:
                a.accessTokenEnc = encrypt(r.accessToken)
                if r.refreshToken:
                    a.refreshTokenEnc = encrypt(r.refreshToken)
                a.tokenExpiresAt = r.tokenExpiresAt
                a.status = "active"
                s.commit()
                ctx.accessToken = r.accessToken
                ctx.refreshToken = r.refreshToken or ctx.refreshToken
        except Exception as e:
            if a.tokenExpiresAt < utcnow():
                a.status = "expired"
                s.commit()
                raise RuntimeError(f"The {a.platform} connection expired. Reconnect the account. ({e})") from None
    return ctx
