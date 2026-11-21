"""Who is calling: the signed-in user, admin checks and workspace access (plan or credits)."""

from __future__ import annotations

from fastapi import Depends, Request

from .config import settings
from .credits import credit_summary
from .db import get_db
from .http import HttpError
from .models import Post, RevokedSession, SocialAccount, User
from .odm import Session, func, select
from .plans import PLANS, has_active_subscription, limits_for
from .security import session_payload


def current_user(request: Request, s: Session) -> User | None:
    cached = getattr(request.state, "user", False)
    if cached is not False:
        return cached
    payload = session_payload(request)
    sub, version, jti = (payload.get("sub"), payload.get("v", 0), payload.get("jti")) if payload else (None, 0, None)
    user = s.get(User, sub) if isinstance(sub, str) else None
    if user and version != user.sessionVersion:
        user = None  # signed out everywhere after a password change
    if user and isinstance(jti, str) and s.get(RevokedSession, jti):
        user = None  # this session was signed out
    if user and user.suspendedAt is not None:
        user = None  # suspended by an admin
    request.state.user = user
    return user


def is_admin(user: User) -> bool:
    return user.email.lower() in settings.admin_emails


def has_access(s: Session, user: User) -> bool:
    """Workspace access: an active plan, or any unexpired credits (trial or packs)."""
    return has_active_subscription(user) or credit_summary(s, user.id).total > 0


def require_user(request: Request, s: Session = Depends(get_db)) -> User:
    """The signed-in user, or 401 (the web app sends the visitor to sign in)."""
    user = current_user(request, s)
    if not user:
        raise HttpError(401, "Please sign in.", "unauthenticated")
    return user


def require_subscriber(request: Request, s: Session = Depends(get_db)) -> User:
    """A signed-in user with a plan or credits, else 402 (the web app opens Billing)."""
    user = require_user(request, s)
    if not has_access(s, user):
        raise HttpError(402, "You're out of credits. Buy credits or choose a plan in Billing.", "no_credits")
    return user


def require_admin(request: Request, s: Session = Depends(get_db)) -> User:
    user = require_user(request, s)
    # 404 rather than 403, so the admin area isn't discoverable. Being on ADMIN_EMAILS isn't enough:
    # the account must have finished portal setup, which proves it owns that inbox.
    if not is_admin(user) or not admin_verified(s, user):
        raise HttpError(404, "Not found.")
    return user


def admin_verified(s: Session, user: User) -> bool:
    from .models import AdminTotp

    row = s.get(AdminTotp, user.id)
    return bool(row and row.secretEnc)


NETWORK_NAMES = {"youtube": "YouTube", "facebook": "Facebook", "instagram": "Instagram"}


def plan_for_network(platform: str) -> str | None:
    """The smallest plan that can connect a network."""
    return next((p["name"] for p in PLANS if platform in p["limits"]["networks"]), None)


def network_allowed(user: User, platform: str) -> bool:
    return platform == "sandbox" or platform in limits_for(user)["networks"]


def assert_network_allowed(user: User, platform: str) -> None:
    if not network_allowed(user, platform):
        plan = plan_for_network(platform)
        where = f" It comes with the {plan} plan and up." if plan else ""
        raise HttpError(402, f"{NETWORK_NAMES.get(platform, platform)} isn't included in your plan.{where}", "plan_feature")


ENGINE_NAMES = {"podcast": "Podcast", "gaming": "Gaming", "movies": "Film & TV", "sports": "Sports", "other": "General"}


def assert_engine_allowed(user: User, category: str) -> None:
    if category not in limits_for(user)["engines"]:
        plan = next((p["name"] for p in PLANS if category in p["limits"]["engines"]), None)
        where = f" It comes with the {plan} plan and up." if plan else ""
        raise HttpError(402, f"The {ENGINE_NAMES.get(category, category)} engine isn't included in your plan.{where}", "plan_feature")


def assert_can_connect_account(s: Session, user: User, platform: str | None = None) -> None:
    if platform:
        assert_network_allowed(user, platform)
    limits = limits_for(user)
    n = s.scalar(select(func.count()).select_from(SocialAccount).where(SocialAccount.userId == user.id, SocialAccount.platform != "sandbox"))
    if (n or 0) >= limits["socialAccounts"]:
        where = " on your plan" if has_active_subscription(user) else " without a plan"
        raise HttpError(402, f"You can connect up to {limits['socialAccounts']} accounts{where}. Upgrade for more.", "limit_reached")


FEATURE_NAMES = {"captions": "AI hooks and captions", "posting": "Posting", "scheduling": "Scheduling", "postAnalytics": "Analytics per post"}


def has_feature(user: User, key: str) -> bool:
    return bool(limits_for(user).get(key))


def assert_feature(user: User, key: str) -> None:
    """402 when the user's plan doesn't include a feature (see pricing.json limits)."""
    if not has_feature(user, key):
        with_it = [p["name"] for p in PLANS if p["limits"].get(key)]
        where = f" It comes with the {' and '.join(with_it)} plan{'s' if len(with_it) > 1 else ''}." if with_it else ""
        raise HttpError(402, f"{FEATURE_NAMES[key]} isn't included in your plan.{where}", "plan_feature")


def assert_can_queue_posts(s: Session, user: User, adding: int) -> None:
    assert_feature(user, "posting")
    limits = limits_for(user)
    n = s.scalar(select(func.count()).select_from(Post).where(Post.userId == user.id, Post.status.in_(["queued", "scheduled"]))) or 0
    if n + adding > limits["scheduledPosts"]:
        raise HttpError(402, f"Your queue holds up to {limits['scheduledPosts']} posts (you have {n}). Upgrade for more.", "limit_reached")
