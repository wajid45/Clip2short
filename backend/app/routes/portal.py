"""Admin portal API (/api/portal/*): sign-in with an authenticator code, the overview, and users.

Every route except sign-in needs a portal session (see app/portal.py). Errors on the sign-in path
are deliberately the same for "no such admin", "wrong password" and "wrong code".
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from collections import Counter
from datetime import timedelta
from typing import Literal

from fastapi import Depends, Request
from fastapi.responses import RedirectResponse

from .. import notify
from ..auth import is_admin
from ..background import after
from ..billing import price_for_plan, stripe_client, sync_subscription
from ..config import settings
from ..credits import by_source, credit_summary, grant_credits, grant_plan_credits
from ..db import get_db, utcnow
from ..email import send_admin_code
from ..http import HttpError, json_response, validate
from ..models import (
    AdminAudit,
    AdminTotp,
    AiUsage,
    Clip,
    ContactMessage,
    CreditGrant,
    CreditTransaction,
    Lead,
    Payment,
    Post,
    SocialAccount,
    UsageEvent,
    User,
    UserTwoFactor,
    Video,
)
from ..odm import Session, func, or_, select
from ..plans import CREDIT_PACKS, PLANS, get_plan, has_active_subscription
from ..portal import (
    PORTAL_COOKIE,
    _key,
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

log = logging.getLogger("clip2short.portal")
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
        # First sign-in. ADMIN_EMAILS grants admin by address, and sign-up doesn't prove an address,
        # so the inbox must answer before an authenticator can be bound to this account.
        s.commit()
        code = f"{secrets.randbelow(1_000_000):06d}"
        after(_send_admin_code, user.email, user.name, code)
        audit(s, request, user, "enroll_email_sent")
        return json_response({"step": "verify-email", "emailToken": sign({"typ": "enroll-email", "sub": user.id, "ch": _code_hash(user.id, code)}, ENROLL_TTL)})
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


def _code_hash(user_id: str, code: str) -> str:
    """Keyed hash of an emailed code: the token carries it, and without the server key it can't be brute-forced offline."""
    return hmac.new(_key(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _send_admin_code(to: str, name: str | None, code: str) -> None:
    try:
        send_admin_code(to, name, code, ENROLL_TTL // 60)
    except Exception:
        log.exception("admin setup code email failed")


class EnrollEmail(Model):
    emailToken: text(10, 2000)  # type: ignore[valid-type]
    code: text(6, 12, min_msg="Enter the 6-digit code from the email")  # type: ignore[valid-type]


@router.post("/portal/auth/enroll/email")
def portal_enroll_email(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    """The code from the email proves the admin owns the inbox; only then is the QR code shown."""
    check_ip(request)
    rate_limit(request, "portal-login", 6, 60)
    b = validate(EnrollEmail, body)
    claims = unsign(b.emailToken, "enroll-email")
    user = s.get(User, claims["sub"]) if claims else None
    if not claims or not user or not is_admin(user) or user.suspendedAt is not None:
        raise HttpError(400, "This setup has expired. Sign in again to get a new code.", "enroll_expired")
    rate_limit_account("portal-enroll-email", user.email, 5, 15 * 60)
    digits = "".join(ch for ch in b.code if ch.isdigit())
    if not hmac.compare_digest(_code_hash(user.id, digits), str(claims.get("ch", ""))):
        audit(s, request, user, "sign_in_failed", detail="email code")
        raise HttpError(400, "That code doesn't match the one we emailed.", "bad_code")
    totp = s.get(AdminTotp, user.id)
    if not totp:
        totp = AdminTotp(userId=user.id)
        s.add(totp)
    if totp.secretEnc:
        raise HttpError(400, "This account already has an authenticator. Sign in with its code.", "enroll_expired")
    payload = _enroll_payload(user, totp)
    s.commit()
    audit(s, request, user, "enroll_email_verified")
    return json_response(payload)


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


HANDOFF_TTL = 60  # seconds the "Open app" pass is good for


@router.post("/portal/auth/app-handoff")
def app_handoff(request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """"Open app" from the dashboard: the admin is already signed in here with password and 2FA,
    so the app takes that instead of asking again. The pass works once, for 60 seconds."""
    token = sign({"typ": "app-handoff", "sub": admin.id, "v": admin.sessionVersion, "jti": secrets.token_urlsafe(16)}, HANDOFF_TTL)
    audit(s, request, admin, "opened_app")
    return json_response({"url": f"{settings.app_url}/api/auth/from-admin?handoff={token}"})


@router.get("/portal/auth/open-app")
def open_app(request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """The "Open app" link: issues the one-time pass and sends the new tab straight into the app.

    A plain link (no script opening a blank tab first), so it works wherever new tabs do. Only
    followed from the dashboard itself: a link on another site can't start it."""
    if request.headers.get("sec-fetch-site", "same-origin") not in ("same-origin", "same-site", "none"):
        raise HttpError(403, "Open the app from the admin console.")
    token = sign({"typ": "app-handoff", "sub": admin.id, "v": admin.sessionVersion, "jti": secrets.token_urlsafe(16)}, HANDOFF_TTL)
    audit(s, request, admin, "opened_app")
    return RedirectResponse(f"{settings.app_url}/api/auth/from-admin?handoff={token}", status_code=303)


@router.get("/portal/auth/me")
def portal_me(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    totp = s.get(AdminTotp, admin.id)
    return json_response(
        {
            "id": admin.id,
            "email": admin.email,
            "name": admin.name,
            "authenticatorSince": totp.enabledAt if totp else None,
            "appUrl": f"{settings.app_url}/api/auth/from-admin",
        }
    )


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

    recent = s.execute(select(User.id, User.email, User.name, User.plan, User.subscriptionStatus, User.createdAt).order_by(User.createdAt.desc()).limit(5)).all()

    # One daily series per card, so each can draw its last 30 days.
    window = d30 - timedelta(days=1)

    def per_day(dates) -> Counter:
        return Counter(d.date().isoformat() for d in dates if d is not None)

    pay_rows = s.execute(select(Payment.createdAt, Payment.kind, Payment.status, Payment.amountCents, Payment.refundedCents).where(Payment.createdAt >= window)).all()
    ok = [r for r in pay_rows if r.status != "failed"]
    revenue_days: Counter = Counter()
    for r in ok:
        revenue_days[r.createdAt.date().isoformat()] += ((r.amountCents or 0) - r.refundedCents) / 100
    grant_days: Counter = Counter()
    for created, amount in s.execute(select(CreditGrant.createdAt, CreditGrant.amount).where(CreditGrant.createdAt >= window)).all():
        grant_days[created.date().isoformat()] += amount
    net_days: Counter = Counter(grant_days)
    for k_, v_ in spend_days.items():
        net_days[k_] -= v_

    # Gemini: calls, tokens and cost (at GEMINI_PRICES) over 30 days.
    ai_rows = s.execute(select(AiUsage.createdAt, AiUsage.model, AiUsage.inputTokens, AiUsage.outputTokens, AiUsage.costMicros).where(AiUsage.createdAt >= window)).all()
    ai30 = [r for r in ai_rows if r.createdAt >= d30]
    ai_cost_days: Counter = Counter()
    ai_token_days: Counter = Counter()
    for r in ai_rows:
        day = r.createdAt.date().isoformat()
        ai_cost_days[day] += (r.costMicros or 0) / 1_000_000
        ai_token_days[day] += r.inputTokens + r.outputTokens
    by_model: dict[str, dict] = {}
    for r in ai30:
        m = by_model.setdefault(r.model, {"model": r.model, "calls": 0, "tokens": 0, "cost": 0.0, "priced": r.model in settings.gemini_prices})
        m["calls"] += 1
        m["tokens"] += r.inputTokens + r.outputTokens
        m["cost"] += (r.costMicros or 0) / 1_000_000
    ai_cost = sum((r.costMicros or 0) for r in ai30) / 1_000_000
    days30 = _days(30)

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
            "paidByDay": _series(days30, per_day(r.createdAt for r in ok if r.kind == "plan")),
            "packsByDay": _series(days30, per_day(r.createdAt for r in ok if r.kind == "pack")),
            "revenueByDay": _series(days30, revenue_days),
            "grantsByDay": _series(days30, grant_days),
            "netCreditsByDay": _series(days30, net_days),
            "suspendedByDay": _series(days30, per_day(u.suspendedAt for u in users if u.suspendedAt and u.suspendedAt >= window)),
            "publishedByDay": _series(days30, per_day(s.execute(select(Post.publishedAt).where(Post.publishedAt >= window)).scalars())),
            "failedAnalysesByDay": _series(days30, per_day(s.execute(select(Video.updatedAt).where(Video.analysisStatus == "failed", Video.updatedAt >= window)).scalars())),
            "failedPostsByDay": _series(days30, per_day(s.execute(select(Post.updatedAt).where(Post.status == "failed", Post.updatedAt >= window)).scalars())),
            "ai": {
                "calls30d": len(ai30),
                "inputTokens30d": sum(r.inputTokens for r in ai30),
                "outputTokens30d": sum(r.outputTokens for r in ai30),
                "cost30d": round(ai_cost, 4),
                "unpricedCalls30d": sum(1 for r in ai30 if r.costMicros is None),
                "pricesSet": bool(settings.gemini_prices),
                "byModel": sorted(by_model.values(), key=lambda m: -m["tokens"]),
                "costByDay": _series(days30, ai_cost_days),
                "callsByDay": _series(days30, per_day(r.createdAt for r in ai_rows)),
                "tokensByDay": _series(days30, ai_token_days),
            },
            "recentSignups": [dict(r._mapping) for r in recent],
        }
    )


# ── Users ───────────────────────────────────────────────────────────────────


def _per_user(s: Session, q, ids: list[str]) -> dict:
    """{userId: value} from a `select(X.userId, aggregate).group_by(X.userId)` limited to `ids`."""
    return dict(s.execute(q.where(q.entities[0].in_(ids)).group_by(q.entities[0])).all()) if ids else {}


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
    query = select(User)
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

    users = s.scalars(query.order_by(User.createdAt.desc())).all()
    ids = [u.id for u in users]
    credits = _per_user(
        s,
        select(CreditGrant.userId, func.sum(CreditGrant.remaining)).where(CreditGrant.remaining > 0, or_(CreditGrant.expiresAt.is_(None), CreditGrant.expiresAt > now)),
        ids,
    )
    videos = _per_user(s, select(Video.userId, func.count()), ids)
    posts = _per_user(s, select(Post.userId, func.count()).where(Post.status == "published"), ids)
    last_video = _per_user(s, select(Video.userId, func.max(Video.createdAt)), ids)
    last_event = _per_user(s, select(UsageEvent.userId, func.max(UsageEvent.createdAt)), ids)

    def last_active(uid: str):
        seen = [d for d in (last_video.get(uid), last_event.get(uid)) if d is not None]
        return max(seen) if seen else None

    if sort == "oldest":
        users = list(reversed(users))
    elif sort == "credits":
        users = sorted(users, key=lambda u: credits.get(u.id) or 0, reverse=True)
    elif sort == "videos":
        users = sorted(users, key=lambda u: videos.get(u.id) or 0, reverse=True)
    elif sort == "active":
        users = sorted(users, key=lambda u: (last_active(u.id) is not None, last_active(u.id) or now), reverse=True)
    total = len(users)
    page = max(1, page)
    rows = users[(page - 1) * per_page : page * per_page]

    def row(u: User) -> dict:
        return {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "createdAt": u.createdAt,
            "plan": u.plan if has_active_subscription(u) else "none",
            "subscriptionStatus": u.subscriptionStatus,
            "credits": int(credits.get(u.id) or 0),
            "videos": int(videos.get(u.id) or 0),
            "posts": int(posts.get(u.id) or 0),
            "lastActive": last_active(u.id),
            "suspended": u.suspendedAt is not None,
            "admin": is_admin(u),
        }

    return json_response({"users": [row(u) for u in rows], "total": total, "page": page, "perPage": per_page})


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
    recent_videos = s.scalars(select(Video).where(Video.userId == u.id).order_by(Video.createdAt.desc()).limit(10)).all()
    clip_counts = dict(s.execute(select(Clip.videoId, func.count()).where(Clip.videoId.in_([v.id for v in recent_videos])).group_by(Clip.videoId)).all())
    videos = [
        {
            "id": v.id,
            "title": v.title,
            "platform": v.platform,
            "durationSec": v.durationSec,
            "analysisStatus": v.analysisStatus,
            "captionStatus": v.captionStatus,
            "createdAt": v.createdAt,
            "clips": clip_counts.get(v.id, 0),
        }
        for v in recent_videos
    ]
    post_counts = dict(s.execute(select(Post.status, func.count()).where(Post.userId == u.id).group_by(Post.status)).all())
    accounts = s.execute(
        select(SocialAccount.platform, SocialAccount.displayName, SocialAccount.username, SocialAccount.status, SocialAccount.createdAt, SocialAccount.tokenExpiresAt).where(SocialAccount.userId == u.id)
    ).all()
    pays = s.scalars(select(Payment).where(Payment.userId == u.id).order_by(Payment.createdAt.desc())).all()
    paid = [p for p in pays if p.status != "failed"]
    dash = "https://dashboard.stripe.com/" + ("test/" if (settings.stripe_secret or "").startswith("sk_test") else "")
    stripe_info = {
        "customerId": u.stripeCustomerId,
        "subscriptionId": u.stripeSubscriptionId,
        "status": u.subscriptionStatus,
        "currentPeriodEnd": u.currentPeriodEnd,
        "cancelAtPeriodEnd": u.cancelAtPeriodEnd,
        "paidCents": sum((p.amountCents or 0) - p.refundedCents for p in paid),
        "payments": len(paid),
        "failed": sum(1 for p in pays if p.status == "failed"),
        "lastPaymentAt": paid[0].createdAt if paid else None,
        "customerUrl": f"{dash}customers/{u.stripeCustomerId}" if u.stripeCustomerId else None,
        "subscriptionUrl": f"{dash}subscriptions/{u.stripeSubscriptionId}" if u.stripeSubscriptionId else None,
    }
    history = s.scalars(select(AdminAudit).where(AdminAudit.targetUserId == u.id).order_by(AdminAudit.createdAt.desc()).limit(20)).all()
    counts = {
        "videos": s.scalar(select(func.count()).select_from(Video).where(Video.userId == u.id)) or 0,
        "clips": s.scalar(select(func.count()).select_from(Clip).where(Clip.userId == u.id)) or 0,
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
                "adminAuthenticator": bool(s.get(AdminTotp, u.id) and s.get(AdminTotp, u.id).secretEnc),
                "stripeSubscription": bool(u.stripeSubscriptionId),
                "isSelf": u.id == admin.id,
            },
            "credits": {"total": summary.total, "bySource": by_source(summary)},
            "counts": counts,
            "posts": post_counts,
            "grants": [{"id": g.id, "source": g.source, "amount": g.amount, "remaining": g.remaining, "expiresAt": g.expiresAt, "createdAt": g.createdAt} for g in grants],
            "transactions": [{"id": t.id, "delta": t.delta, "kind": t.kind, "description": t.description, "createdAt": t.createdAt, "refunded": t.refundedAt is not None} for t in txs],
            "videos": videos,
            "accounts": [dict(a._mapping) for a in accounts],
            "stripe": stripe_info,
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
    grant_credits(s, user_id=u.id, source="admin", amount=b.amount, expires_at=expires, description=b.note.strip() or "Added by the Clip2Short team")
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


class ChangePlan(Model):
    plan: Literal["none", "creator", "pro", "studio"]
    grantCredits: bool = True  # for a plan given without Stripe: add the plan's monthly credits now


@router.post("/portal/users/{user_id}/plan")
def change_plan(user_id: str, request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """Changes a customer's plan.

    Paying through Stripe: the subscription itself is changed, so billing stays right (a move to
    another plan is prorated; "none" cancels at the end of the paid period). Not paying through
    Stripe: the plan is given directly for 30 days, optionally with that plan's monthly credits.
    """
    b = validate(ChangePlan, body)
    u = _get_user(s, user_id)
    plan = get_plan(b.plan) if b.plan != "none" else None
    sub_id = u.stripeSubscriptionId
    if sub_id and settings.stripe_secret:
        client = stripe_client()
        sub = client.v1.subscriptions.retrieve(sub_id)
        if plan is None:
            sub = client.v1.subscriptions.update(sub_id, params={"cancel_at_period_end": True})
            detail = "cancel at period end (Stripe)"
        else:
            price = price_for_plan(b.plan)
            if not price:
                raise HttpError(400, f"STRIPE_PRICE_{b.plan.upper()} isn't set, so Stripe can't switch to this plan.")
            items = (sub.get("items") or {}).get("data") or []
            if not items:
                raise HttpError(409, "This Stripe subscription has no items to change.")
            sub = client.v1.subscriptions.update(
                sub_id,
                params={"items": [{"id": items[0]["id"], "price": price}], "proration_behavior": "create_prorations", "cancel_at_period_end": False},
            )
            detail = f"{plan['name']} (Stripe, prorated)"
        sync_subscription(s, sub)
    else:
        if plan is None:
            u.plan, u.subscriptionStatus, u.currentPeriodEnd, u.cancelAtPeriodEnd = "none", "canceled", None, False
            detail = "removed"
        else:
            end = utcnow() + timedelta(days=30)
            u.plan, u.subscriptionStatus, u.currentPeriodEnd, u.cancelAtPeriodEnd = b.plan, "active", end, False
            detail = f"{plan['name']} for 30 days (given by an admin)"
            if b.grantCredits:
                grant_plan_credits(s, u.id, plan, end, f"admin-plan:{u.id}:{int(utcnow().timestamp() * 1000)}")
                detail += f", {plan['monthlyCredits']:,} credits"
        s.commit()
    audit(s, request, admin, "plan_changed", target=u.id, detail=detail)
    return json_response({"ok": True, "detail": detail})


@router.post("/portal/users/{user_id}/reset-authenticator")
def reset_admin_authenticator(user_id: str, request: Request, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """For an admin who lost their phone: another admin clears their authenticator. Their portal
    sessions end, and their next sign-in emails them a code and shows a new QR code."""
    u = _get_user(s, user_id)
    if u.id == admin.id:
        raise HttpError(400, "You can't reset your own authenticator. Ask another admin, or replace it from My Authenticator.")
    if not is_admin(u):
        raise HttpError(400, "Only admin accounts have a portal authenticator.")
    totp = s.get(AdminTotp, u.id)
    if not totp or not totp.secretEnc:
        raise HttpError(409, "This admin hasn't set up an authenticator yet.")
    totp.secretEnc, totp.pendingSecretEnc, totp.lastStep = None, None, 0
    totp.sessionVersion += 1
    s.commit()
    audit(s, request, admin, "admin_authenticator_reset", target=u.id)
    after(notify.security_change, u.id, "Your admin authenticator was reset", "Another admin reset the authenticator for your Clip2Short admin account. Your next admin sign-in will email you a code and show a new QR code.")
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
    after(notify.security_change, u.id, "Two-factor sign-in is off", "Our support team turned off two-factor sign-in for your Clip2Short account at your request. Turn it back on in Settings.")
    return json_response({"ok": True})


# ── Payments ────────────────────────────────────────────────────────────────


@router.get("/portal/payments")
def list_payments(
    status: Literal["all", "paid", "failed", "refunded"] = "all",
    kind: Literal["all", "plan", "pack"] = "all",
    mode: Literal["all", "live", "test"] = "all",
    page: int = 1,
    admin: User = Depends(require_portal_admin),
    s: Session = Depends(get_db),
):
    """Every payment, newest first, with 30-day totals and a daily revenue series for the chart."""
    per_page = 25
    since = utcnow() - timedelta(days=30)
    q = select(Payment)
    if status == "refunded":
        q = q.where(Payment.status.in_(["refunded", "partially_refunded"]))
    elif status != "all":
        q = q.where(Payment.status == status)
    if kind != "all":
        q = q.where(Payment.kind == kind)
    if mode != "all":
        q = q.where(Payment.live.is_(mode == "live"))
    total = s.scalar(select(func.count()).select_from(Payment).where(*q.wheres)) or 0
    page = max(1, page)
    rows = s.scalars(q.order_by(Payment.createdAt.desc()).offset((page - 1) * per_page).limit(per_page)).all()

    recent = s.scalars(select(Payment).where(Payment.createdAt >= since)).all()
    paid = [p for p in recent if p.status in ("paid", "partially_refunded", "refunded")]
    gross = sum(p.amountCents or 0 for p in paid)
    refunded = sum(p.refundedCents for p in recent)
    by_day: dict[str, int] = {}
    for p in paid:
        key = p.createdAt.date().isoformat()
        by_day[key] = by_day.get(key, 0) + (p.amountCents or 0) - p.refundedCents
    days = [(since + timedelta(days=i + 1)).date().isoformat() for i in range(30)]
    return json_response(
        {
            "summary": {
                "netCents": gross - refunded,
                "grossCents": gross,
                "refundedCents": refunded,
                "paid": len(paid),
                "failed": sum(1 for p in recent if p.status == "failed"),
                "refunds": sum(1 for p in recent if p.status in ("refunded", "partially_refunded")),
                "plans": sum(1 for p in paid if p.kind == "plan"),
                "packs": sum(1 for p in paid if p.kind == "pack"),
                "anyTest": s.scalar(select(func.count()).select_from(Payment).where(Payment.live.is_(False))) or 0,
            },
            "revenueByDay": [{"key": d, "cents": by_day.get(d, 0)} for d in days],
            "payments": [
                {
                    "id": p.id,
                    "userId": p.userId,
                    "email": p.email,
                    "kind": p.kind,
                    "status": p.status,
                    "amountCents": p.amountCents,
                    "refundedCents": p.refundedCents,
                    "currency": p.currency,
                    "description": p.description,
                    "ref": p.ref,
                    "tags": [t for t in p.tags.split(",") if t],
                    "createdAt": p.createdAt,
                }
                for p in rows
            ],
            "total": total,
            "perPage": per_page,
            "allTags": sorted({t for tags in s.scalars(select(Payment.tags).where(Payment.tags != "")) for t in tags.split(",") if t}, key=str.lower),
        }
    )


class PaymentTags(Model):
    ids: list[str]
    add: list[str] = []
    remove: list[str] = []


@router.post("/portal/payments/tags")
def tag_payments(request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """Adds or removes tags on several payments at once (the selected rows)."""
    b = validate(PaymentTags, body)
    if not b.ids or len(b.ids) > 200:
        raise HttpError(400, "Select between 1 and 200 payments.")
    add = [" ".join(t.replace(",", " ").split())[:32] for t in b.add]
    add = [t for t in add if t]
    drop = {t.lower() for t in b.remove}
    changed = 0
    for p in s.scalars(select(Payment).where(Payment.id.in_(b.ids))).all():
        tags = [t for t in p.tags.split(",") if t and t.lower() not in drop]
        for t in add:
            if t.lower() not in (x.lower() for x in tags):
                tags.append(t)
        if len(tags) > 8:
            raise HttpError(400, "A payment can have at most 8 tags.")
        if ",".join(tags) != p.tags:
            p.tags = ",".join(tags)
            changed += 1
    s.commit()
    if changed:
        audit(s, request, admin, "payments_tagged", detail=f"{changed} payments: +[{', '.join(add)}] -[{', '.join(b.remove)}]")
    return json_response({"ok": True, "changed": changed})


class PaymentEdit(Model):
    status: Literal["paid", "failed", "refunded", "partially_refunded"] | None = None
    tags: list[str] | None = None


@router.patch("/portal/payments/{payment_id}")
def edit_payment(payment_id: str, request: Request, body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    """An admin's correction or label on a payment. Stripe stays the source of truth for money:
    this changes how the payment is shown here, not what was charged."""
    b = validate(PaymentEdit, body)
    p = s.get(Payment, payment_id)
    if not p:
        raise HttpError(404, "Payment not found.")
    changes = []
    if b.status and b.status != p.status:
        changes.append(f"status {p.status} -> {b.status}")
        p.status = b.status
    if b.tags is not None:
        clean = []
        for t in b.tags:
            t = " ".join(t.replace(",", " ").split())[:32]
            if t and t.lower() not in (c.lower() for c in clean):
                clean.append(t)
        if len(clean) > 8:
            raise HttpError(400, "Use at most 8 tags.")
        joined = ",".join(clean)
        if joined != p.tags:
            changes.append(f"tags [{joined}]")
            p.tags = joined
    s.commit()
    if changes:
        audit(s, request, admin, "payment_edited", target=p.userId, detail=f"{p.ref}: " + "; ".join(changes))
    return json_response({"ok": True, "status": p.status, "tags": [t for t in p.tags.split(",") if t]})


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


# ── Social media integrations (the developer apps customers connect through) ──


@router.get("/portal/integrations")
def portal_integrations(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    from .pages import integrations_list

    return json_response({"integrations": integrations_list(s)})


@router.post("/portal/integrations")
def portal_save_integration(body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    from .account import store_integration

    store_integration(s, body)
    return json_response({"ok": True})


@router.delete("/portal/integrations")
def portal_remove_integration(body: JsonBody, admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    from .account import drop_integration

    drop_integration(s, body)
    return json_response({"ok": True})


# ── Leads captured on the landing site ──


@router.get("/portal/leads")
def portal_leads(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    rows = s.scalars(select(Lead).order_by(Lead.createdAt.desc()).limit(1000)).all()
    keys = ("id", "email", "source", "utmSource", "utmMedium", "utmCampaign", "referrer", "signups", "createdAt")
    return json_response(
        {
            "leads": [{k: getattr(lead, k) for k in keys} for lead in rows],
            "total": s.scalar(select(func.count()).select_from(Lead)) or 0,
            "converted": s.scalar(select(func.count()).select_from(Lead).where(Lead.source == "converted")) or 0,
        }
    )


@router.get("/portal/leads/export")
def portal_leads_export(admin: User = Depends(require_portal_admin), s: Session = Depends(get_db)):
    from .account import leads_csv

    return leads_csv(s)

