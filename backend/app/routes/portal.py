"""Admin portal API (/api/portal/*): sign-in with an authenticator code, the overview, and users.

Every route except sign-in needs a portal session (see app/portal.py). Errors on the sign-in path
are deliberately the same for "no such admin", "wrong password" and "wrong code".
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Literal

from fastapi import Depends, Request
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import is_admin
from ..background import after
from ..config import settings
from ..credits import by_source, credit_summary, grant_credits
from ..db import get_db, utcnow
from ..http import HttpError, json_response, validate
from ..models import AdminAudit, AdminTotp, Clip, ContactMessage, CreditGrant, CreditTransaction, Post, SocialAccount, UsageEvent, User, UserTwoFactor, Video
from ..plans import CREDIT_PACKS, PLANS, get_plan, has_active_subscription
from ..portal import (
    PORTAL_COOKIE,
    audit,
    check_ip,
    clear_portal_session,
    match_totp,
    new_totp_secret,
    otpauth_url,
    require_portal_admin,
    set_portal_session,
    sign,
    unsign,
)
from ..ratelimit import rate_limit, rate_limit_account
from ..security import decrypt, encrypt, verify_password
from .common import JsonBody, Model, api_router, email, text

router = api_router()

BAD_SIGN_IN = "That email, password or code doesn't match."
ENROLL_TTL = 10 * 60


# ── Sign-in ─────────────────────────────────────────────────────────────────


class PortalLogin(Model):
    email: email("Enter a valid email")  # type: ignore[valid-type]
    password: text(1, 200, min_msg="Enter your password", strip=False)  # type: ignore[valid-type]
    code: str | None = None


def _enroll_payload(user: User, totp: AdminTotp) -> dict:
    secret = new_totp_secret()
    totp.pendingSecretEnc = encrypt(secret)
    return {
        "step": "enroll",
        "enrollToken": sign({"typ": "enroll", "sub": user.id}, ENROLL_TTL),
        "secret": secret,
        "otpauthUrl": otpauth_url(user.email, secret),
    }


@router.post("/portal/auth/login")
def portal_login(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    """Password first. A first sign-in enrols an authenticator (QR); after that every sign-in needs its code."""
    check_ip(request)
    rate_limit(request, "portal-login", 6, 60)
    b = validate(PortalLogin, body)
    rate_limit_account("portal-login", b.email, 5, 15 * 60)
    user = s.scalar(select(User).where(User.email == b.email.lower()))
    ok = verify_password(b.password, user.passwordHash if user else None)
    if not ok or not user or not is_admin(user) or user.suspendedAt is not None:
        audit(s, request, None, "sign_in_failed", email=b.email.lower(), detail="password")
        raise HttpError(401, BAD_SIGN_IN)

    totp = s.get(AdminTotp, user.id)
    if not totp:
        totp = AdminTotp(userId=user.id)
        s.add(totp)
    if not totp.secretEnc:
        payload = _enroll_payload(user, totp)
        s.commit()
        return json_response(payload)
    if not b.code:
        return json_response({"step": "code"})

    step = match_totp(decrypt(totp.secretEnc), b.code, after_step=totp.lastStep)
    if step is None:
        audit(s, request, user, "sign_in_failed", detail="code")
        raise HttpError(401, BAD_SIGN_IN)
    totp.lastStep = step
    s.commit()
    audit(s, request, user, "sign_in")
    res = json_response({"ok": True})
    set_portal_session(res, user, totp)
    return res


class Enroll(Model):
    enrollToken: text(10)  # type: ignore[valid-type]
    code: text(6, 12, min_msg="Enter the 6-digit code")  # type: ignore[valid-type]


@router.post("/portal/auth/enroll")
def portal_enroll(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    """Confirms the first authenticator with a code from it, then signs in."""
    check_ip(request)
    rate_limit(request, "portal-login", 6, 60)
    b = validate(Enroll, body)
    claims = unsign(b.enrollToken, "enroll")
    user = s.get(User, claims["sub"]) if claims else None
    totp = s.get(AdminTotp, user.id) if user else None
    if not user or not totp or not totp.pendingSecretEnc or totp.secretEnc or not is_admin(user):
        raise HttpError(400, "This setup has expired. Sign in again to get a new QR code.", "enroll_expired")
    secret = decrypt(totp.pendingSecretEnc)
    step = match_totp(secret, b.code)
    if step is None:
        raise HttpError(400, "That code doesn't match. Check the time on your phone and try the newest code.", "bad_code")
    totp.secretEnc, totp.pendingSecretEnc, totp.enabledAt, totp.lastStep = totp.pendingSecretEnc, None, utcnow(), step
    s.commit()
    audit(s, request, user, "authenticator_enrolled")
    res = json_response({"ok": True})
    set_portal_session(res, user, totp)
    return res


@router.post("/portal/auth/logout")
def portal_logout(request: Request, s: Session = Depends(get_db)):
    """Ends the portal session on the server too: every portal session of this admin stops working."""
    claims = unsign(request.cookies.get(PORTAL_COOKIE), "portal")
    totp = s.get(AdminTotp, claims["sub"]) if claims else None
    if totp and claims and claims.get("tv", 0) == totp.sessionVersion:
        totp.sessionVersion += 1
        s.commit()
    res = json_response({"ok": True})
    clear_portal_session(res)
    return res


@router.get("/portal/auth/me")
def portal_me(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    totp = s.get(AdminTotp, admin.id)
    return json_response({"id": admin.id, "email": admin.email, "name": admin.name, "authenticatorSince": totp.enabledAt if totp else None})


class Password(Model):
    password: text(1, 200, min_msg="Enter your password", strip=False)  # type: ignore[valid-type]


@router.post("/portal/auth/authenticator/start")
def replace_start(request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """Starts moving to a new phone. The current authenticator keeps working until the new one is confirmed."""
    rate_limit(request, "portal-login", 6, 60)
    b = validate(Password, body)
    if not verify_password(b.password, admin.passwordHash):
        raise HttpError(400, "That password doesn't match.", "bad_password")
    totp = s.get(AdminTotp, admin.id)
    secret = new_totp_secret()
    totp.pendingSecretEnc = encrypt(secret)
    s.commit()
    return json_response({"secret": secret, "otpauthUrl": otpauth_url(admin.email, secret)})


class Code(Model):
    code: text(6, 12, min_msg="Enter the 6-digit code")  # type: ignore[valid-type]


@router.post("/portal/auth/authenticator/confirm")
def replace_confirm(request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    rate_limit(request, "portal-login", 6, 60)
    b = validate(Code, body)
    totp = s.get(AdminTotp, admin.id)
    if not totp.pendingSecretEnc:
        raise HttpError(400, "Start again: the new QR code has expired.", "enroll_expired")
    step = match_totp(decrypt(totp.pendingSecretEnc), b.code)
    if step is None:
        raise HttpError(400, "That code doesn't match. Check the time on your phone and try the newest code.", "bad_code")
    totp.secretEnc, totp.pendingSecretEnc, totp.enabledAt, totp.lastStep = totp.pendingSecretEnc, None, utcnow(), step
    totp.sessionVersion += 1  # other portal sessions end; this one is re-issued below
    s.commit()
    audit(s, request, admin, "authenticator_replaced")
    res = json_response({"ok": True})
    set_portal_session(res, admin, totp)
    return res


# ── Overview ────────────────────────────────────────────────────────────────


def _days(n: int) -> list[str]:
    today = utcnow().date()
    return [(today - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def _months(n: int) -> list[str]:
    d = utcnow().date().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return out[::-1]


def _series(keys: list[str], counts: Counter) -> list[dict]:
    return [{"key": k, "n": counts.get(k, 0)} for k in keys]


@router.get("/portal/overview")
def overview(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    now = utcnow()
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    year_ago = (now.replace(day=1) - timedelta(days=330)).replace(day=1)

    users = s.execute(select(User.createdAt, User.plan, User.subscriptionStatus, User.suspendedAt)).all()
    paid = [u for u in users if has_active_subscription(u)]
    by_plan = Counter(u.plan for u in paid)
    mrr = sum((get_plan(p) or {}).get("price", 0) * n for p, n in by_plan.items())

    count = lambda q: s.scalar(q) or 0  # noqa: E731
    spent30 = -count(select(func.sum(CreditTransaction.delta)).where(CreditTransaction.kind == "spend", CreditTransaction.createdAt >= d30))
    refunded30 = count(select(func.sum(CreditTransaction.delta)).where(CreditTransaction.kind == "refund", CreditTransaction.createdAt >= d30))
    granted = s.execute(select(CreditGrant.source, func.sum(CreditGrant.amount)).where(CreditGrant.createdAt >= d30).group_by(CreditGrant.source)).all()
    pack_price = {p["credits"]: p["price"] for p in CREDIT_PACKS}
    packs30 = s.execute(select(CreditGrant.amount).where(CreditGrant.source == "pack", CreditGrant.createdAt >= d30)).scalars().all()
    balance = count(select(func.sum(CreditGrant.remaining)).where(CreditGrant.remaining > 0, or_(CreditGrant.expiresAt.is_(None), CreditGrant.expiresAt > now)))

    signup_days = Counter(u.createdAt.date().isoformat() for u in users if u.createdAt >= d30 - timedelta(days=1))
    signup_months = Counter(u.createdAt.strftime("%Y-%m") for u in users if u.createdAt >= year_ago)
    spend_rows = s.execute(select(CreditTransaction.createdAt, CreditTransaction.delta).where(CreditTransaction.kind == "spend", CreditTransaction.createdAt >= d30 - timedelta(days=1))).all()
    spend_days: Counter = Counter()
    for r in spend_rows:
        spend_days[r.createdAt.date().isoformat()] += -r.delta
    video_days = Counter(v.date().isoformat() for v in s.execute(select(Video.createdAt).where(Video.createdAt >= d30 - timedelta(days=1))).scalars())

    recent = s.execute(select(User.id, User.email, User.name, User.plan, User.subscriptionStatus, User.createdAt).order_by(User.createdAt.desc()).limit(8)).all()

    return json_response(
        {
            "generatedAt": now,
            "kpis": {
                "users": len(users),
                "newToday": sum(1 for u in users if u.createdAt >= d1),
                "new7d": sum(1 for u in users if u.createdAt >= d7),
                "new30d": sum(1 for u in users if u.createdAt >= d30),
                "suspended": sum(1 for u in users if u.suspendedAt is not None),
                "paid": len(paid),
                "byPlan": {p["id"]: by_plan.get(p["id"], 0) for p in PLANS},
                "mrr": mrr,
                "packs30d": len(packs30),
                "packRevenue30d": sum(pack_price.get(a, 0) for a in packs30),
                "creditsSpent30d": spent30,
                "creditsRefunded30d": refunded30,
                "creditsGranted30d": {src: int(n or 0) for src, n in granted},
                "creditBalance": balance,
                "videos30d": count(select(func.count()).select_from(Video).where(Video.createdAt >= d30)),
                "analyses30d": count(select(func.count()).select_from(Video).where(Video.analyzedAt >= d30)),
                "failedAnalyses30d": count(select(func.count()).select_from(Video).where(Video.analysisStatus == "failed", Video.updatedAt >= d30)),
                "published30d": count(select(func.count()).select_from(Post).where(Post.publishedAt >= d30)),
                "failedPosts30d": count(select(func.count()).select_from(Post).where(Post.status == "failed", Post.updatedAt >= d30)),
                "queued": count(select(func.count()).select_from(Post).where(Post.status.in_(["queued", "scheduled"]))),
            },
            "signupsByMonth": _series(_months(12), signup_months),
            "signupsByDay": _series(_days(30), signup_days),
            "creditsByDay": _series(_days(30), spend_days),
            "videosByDay": _series(_days(30), video_days),
            "recentSignups": [dict(r._mapping) for r in recent],
        }
    )


# ── Users ───────────────────────────────────────────────────────────────────


def _balance_col(now: datetime):
    return (
        select(func.coalesce(func.sum(CreditGrant.remaining), 0))
        .where(CreditGrant.userId == User.id, CreditGrant.remaining > 0, or_(CreditGrant.expiresAt.is_(None), CreditGrant.expiresAt > now))
        .correlate(User)
        .scalar_subquery()
    )


@router.get("/portal/users")
def list_users(
    q: str = "",
    filter: Literal["all", "paid", "free", "suspended", "admins"] = "all",  # noqa: A002
    sort: Literal["newest", "oldest", "credits", "videos", "active"] = "newest",
    page: int = 1,
    admin: User = Depends(require_portal_admin),
    s: Session = Depends(get_db),
):
    per_page = 25
    now = utcnow()
    balance = _balance_col(now).label("credits")
    videos = select(func.count()).select_from(Video).where(Video.userId == User.id).correlate(User).scalar_subquery().label("videos")
    posts = select(func.count()).select_from(Post).where(Post.userId == User.id, Post.status == "published").correlate(User).scalar_subquery().label("posts")
    last_video = select(func.max(Video.createdAt)).where(Video.userId == User.id).correlate(User).scalar_subquery()
    last_event = select(func.max(UsageEvent.createdAt)).where(UsageEvent.userId == User.id).correlate(User).scalar_subquery()
    # Latest of "imported a video" and any tracked app activity (portable: no GREATEST in SQLite).
    last_active = case((last_event > last_video, last_event), else_=func.coalesce(last_video, last_event)).label("lastActive")

    query = select(User, balance, videos, posts, last_active)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like)))
    if filter == "paid":
        query = query.where(User.subscriptionStatus.in_(["active", "trialing"]), User.plan != "none")
    elif filter == "free":
        query = query.where(or_(User.subscriptionStatus.not_in(["active", "trialing"]), User.plan == "none"))
    elif filter == "suspended":
        query = query.where(User.suspendedAt.is_not(None))
    elif filter == "admins":
        query = query.where(func.lower(User.email).in_(settings.admin_emails or ("",)))

    order = {
        "newest": User.createdAt.desc(),
        "oldest": User.createdAt.asc(),
        "credits": balance.desc(),
        "videos": videos.desc(),
        "active": last_active.desc(),
    }[sort]
    total = s.scalar(select(func.count()).select_from(query.with_only_columns(User.id).subquery())) or 0
    page = max(1, page)
    rows = s.execute(query.order_by(order, User.createdAt.desc()).offset((page - 1) * per_page).limit(per_page)).all()

    def row(r) -> dict:
        u: User = r[0]
        return {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "createdAt": u.createdAt,
            "plan": u.plan if has_active_subscription(u) else "none",
            "subscriptionStatus": u.subscriptionStatus,
            "credits": int(r.credits or 0),
            "videos": int(r.videos or 0),
            "posts": int(r.posts or 0),
            "lastActive": r.lastActive,
            "suspended": u.suspendedAt is not None,
            "admin": is_admin(u),
        }

    return json_response({"users": [row(r) for r in rows], "total": total, "page": page, "perPage": per_page})


def _get_user(s: Session, user_id: str) -> User:
    user = s.get(User, user_id)
    if not user:
        raise HttpError(404, "That user doesn't exist.")
    return user


@router.get("/portal/users/{user_id}")
def user_detail(user_id: str, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    u = _get_user(s, user_id)
    summary = credit_summary(s, u.id)
    grants = s.scalars(select(CreditGrant).where(CreditGrant.userId == u.id).order_by(CreditGrant.createdAt.desc()).limit(20)).all()
    txs = s.scalars(select(CreditTransaction).where(CreditTransaction.userId == u.id).order_by(CreditTransaction.createdAt.desc()).limit(25)).all()
    clip_count = select(func.count()).select_from(Clip).where(Clip.videoId == Video.id).correlate(Video).scalar_subquery()
    videos = s.execute(
        select(Video.id, Video.title, Video.platform, Video.durationSec, Video.analysisStatus, Video.captionStatus, Video.createdAt, clip_count.label("clips"))
        .where(Video.userId == u.id)
        .order_by(Video.createdAt.desc())
        .limit(10)
    ).all()
    post_counts = dict(s.execute(select(Post.status, func.count()).where(Post.userId == u.id).group_by(Post.status)).all())
    accounts = s.execute(select(SocialAccount.platform, SocialAccount.displayName, SocialAccount.username, SocialAccount.status).where(SocialAccount.userId == u.id)).all()
    history = s.scalars(select(AdminAudit).where(AdminAudit.targetUserId == u.id).order_by(AdminAudit.createdAt.desc()).limit(20)).all()
    counts = {
        "videos": s.scalar(select(func.count()).select_from(Video).where(Video.userId == u.id)) or 0,
        "clips": s.scalar(select(func.count()).select_from(Clip).join(Video, Clip.videoId == Video.id).where(Video.userId == u.id)) or 0,
        "creditsSpent": -(s.scalar(select(func.sum(CreditTransaction.delta)).where(CreditTransaction.userId == u.id, CreditTransaction.kind == "spend")) or 0),
    }
    return json_response(
        {
            "user": {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "createdAt": u.createdAt,
                "plan": u.plan,
                "subscriptionStatus": u.subscriptionStatus,
                "activePlan": has_active_subscription(u),
                "currentPeriodEnd": u.currentPeriodEnd,
                "cancelAtPeriodEnd": u.cancelAtPeriodEnd,
                "stripeCustomerId": u.stripeCustomerId,
                "trialStartedAt": u.trialStartedAt,
                "suspendedAt": u.suspendedAt,
                "twoFactor": s.get(UserTwoFactor, u.id) is not None and bool(s.get(UserTwoFactor, u.id).secretEnc),
                "suspendedReason": u.suspendedReason,
                "admin": is_admin(u),
            },
            "credits": {"total": summary.total, "bySource": by_source(summary)},
            "counts": counts,
            "posts": post_counts,
            "grants": [{"id": g.id, "source": g.source, "amount": g.amount, "remaining": g.remaining, "expiresAt": g.expiresAt, "createdAt": g.createdAt} for g in grants],
            "transactions": [{"id": t.id, "delta": t.delta, "kind": t.kind, "description": t.description, "createdAt": t.createdAt, "refunded": t.refundedAt is not None} for t in txs],
            "videos": [dict(v._mapping) for v in videos],
            "accounts": [dict(a._mapping) for a in accounts],
            "history": [{"id": h.id, "action": h.action, "adminEmail": h.adminEmail, "detail": h.detail, "createdAt": h.createdAt} for h in history],
        }
    )


class Grant(Model):
    amount: int
    note: text(0, 200) = ""  # type: ignore[valid-type]
    expiresInDays: int | None = None


@router.post("/portal/users/{user_id}/credits")
def grant(user_id: str, request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    b = validate(Grant, body)
    if not 1 <= b.amount <= 100_000:
        raise HttpError(400, "amount: Enter between 1 and 100,000 credits")
    if b.expiresInDays is not None and not 1 <= b.expiresInDays <= 3650:
        raise HttpError(400, "expiresInDays: Use 1 to 3650 days, or leave it empty for no expiry")
    u = _get_user(s, user_id)
    expires = utcnow() + timedelta(days=b.expiresInDays) if b.expiresInDays else None
    grant_credits(s, user_id=u.id, source="admin", amount=b.amount, expires_at=expires, description=b.note.strip() or "Added by the Shortlark team")
    audit(s, request, admin, "credits_granted", target=u.id, detail=f"{b.amount} credits" + (f" · {b.note.strip()}" if b.note.strip() else ""))
    return json_response({"ok": True})


class Suspend(Model):
    reason: text(0, 300) = ""  # type: ignore[valid-type]


@router.post("/portal/users/{user_id}/suspend")
def suspend(user_id: str, request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    b = validate(Suspend, body)
    u = _get_user(s, user_id)
    if u.id == admin.id or is_admin(u):
        raise HttpError(400, "Admins can't be suspended from the portal. Remove them from ADMIN_EMAILS first.")
    u.suspendedAt, u.suspendedReason = utcnow(), b.reason.strip() or None
    u.sessionVersion += 1  # signs them out everywhere
    s.commit()
    audit(s, request, admin, "user_suspended", target=u.id, detail=b.reason.strip() or None)
    return json_response({"ok": True})


@router.post("/portal/users/{user_id}/unsuspend")
def unsuspend(user_id: str, request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    u = _get_user(s, user_id)
    u.suspendedAt, u.suspendedReason = None, None
    s.commit()
    audit(s, request, admin, "user_unsuspended", target=u.id)
    return json_response({"ok": True})


@router.post("/portal/users/{user_id}/signout")
def sign_out_everywhere(user_id: str, request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    u = _get_user(s, user_id)
    u.sessionVersion += 1
    s.commit()
    audit(s, request, admin, "user_signed_out", target=u.id)
    return json_response({"ok": True})


@router.post("/portal/users/{user_id}/two-factor-off")
def turn_off_two_factor(user_id: str, request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """For someone who lost both their phone and their backup codes. Confirm who they are first."""
    u = _get_user(s, user_id)
    row = s.get(UserTwoFactor, u.id)
    if not row:
        raise HttpError(409, "Two-factor sign-in is already off for this account.")
    s.delete(row)
    u.sessionVersion += 1
    s.commit()
    audit(s, request, admin, "user_two_factor_off", target=u.id)
    after(notify.security_change, u.id, "Two-factor sign-in is off", "Our support team turned off two-factor sign-in for your Shortlark account at your request. Turn it back on in Settings.")
    return json_response({"ok": True})


# ── Contact messages ────────────────────────────────────────────────────────


@router.get("/portal/messages")
def list_messages(status: Literal["open", "handled", "all"] = "open", admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    q = select(ContactMessage).order_by(ContactMessage.createdAt.desc()).limit(200)
    if status != "all":
        q = q.where(ContactMessage.handled.is_(status == "handled"))
    rows = s.scalars(q).all()
    open_count = s.scalar(select(func.count()).select_from(ContactMessage).where(ContactMessage.handled.is_(False))) or 0
    known = {u.email: u.id for u in s.execute(select(User.email, User.id).where(User.email.in_({m.email.lower() for m in rows}))).all()} if rows else {}
    return json_response(
        {
            "open": open_count,
            "messages": [
                {
                    "id": m.id,
                    "name": m.name,
                    "email": m.email,
                    "topic": m.topic,
                    "message": m.message,
                    "handled": m.handled,
                    "createdAt": m.createdAt,
                    "userId": known.get(m.email.lower()),
                }
                for m in rows
            ],
        }
    )


class Handled(Model):
    handled: bool


@router.patch("/portal/messages/{message_id}")
def mark_message(message_id: str, request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    b = validate(Handled, body)
    m = s.get(ContactMessage, message_id)
    if not m:
        raise HttpError(404, "That message doesn't exist.")
    m.handled = b.handled
    s.commit()
    audit(s, request, admin, "message_handled" if b.handled else "message_reopened", detail=f"{m.email} · {m.topic}")
    return json_response({"ok": True})


@router.get("/portal/badges")
def badges(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    return json_response({"openMessages": s.scalar(select(func.count()).select_from(ContactMessage).where(ContactMessage.handled.is_(False))) or 0})
