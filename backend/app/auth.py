"""Who is calling: the signed-in user, admin checks and workspace access (plan or credits)."""

from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .credits import credit_summary
from .db import get_db
from .http import HttpError
from .models import Post, SocialAccount, User
from .plans import has_active_subscription, limits_for
from .security import session_user_id


def current_user(request: Request, s: Session) -> User | None:
    cached = getattr(request.state, "user", False)
    if cached is not False:
        return cached
    uid = session_user_id(request)
    user = s.get(User, uid) if uid else None
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
    # 404 rather than 403, so the admin area isn't discoverable.
    if not is_admin(user):
        raise HttpError(404, "Not found.")
    return user


def assert_can_connect_account(s: Session, user: User) -> None:
    limits = limits_for(user)
    n = s.scalar(select(func.count()).select_from(SocialAccount).where(SocialAccount.userId == user.id, SocialAccount.platform != "sandbox"))
    if (n or 0) >= limits["socialAccounts"]:
        where = " on your plan" if has_active_subscription(user) else " without a plan"
        raise HttpError(402, f"You can connect up to {limits['socialAccounts']} accounts{where}. Upgrade for more.", "limit_reached")


def assert_can_queue_posts(s: Session, user: User, adding: int) -> None:
    limits = limits_for(user)
    n = s.scalar(select(func.count()).select_from(Post).where(Post.userId == user.id, Post.status.in_(["queued", "scheduled"]))) or 0
    if n + adding > limits["scheduledPosts"]:
        raise HttpError(402, f"Your queue holds up to {limits['scheduledPosts']} posts (you have {n}). Upgrade for more.", "limit_reached")
