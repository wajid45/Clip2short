"""Auth, admin settings, credits summary, leads, public thumbnails and the cron hook."""

import csv
import hmac
import io
import re
from typing import Literal

import httpx
from fastapi import Depends, Request
from fastapi.responses import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..auth import require_admin, require_user
from ..config import settings
from ..credits import by_source, credit_summary, ensure_trial
from ..db import get_db, utcnow
from ..http import HttpError, iso, json_response, validate
from ..integrations import INTEGRATIONS, load_integrations
from ..models import CreditTransaction, IntegrationSetting, Lead, User
from ..ratelimit import rate_limit
from ..security import clear_session, encrypt, hash_password, set_session, verify_password
from ..social.publisher import refresh_stats, run_publisher
from ..video.fetcher import BROWSER_UA
from .common import JsonBody, Model, api_router, email, text

router = api_router()


# ── Auth ────────────────────────────────────────────────────────────────────


class Login(Model):
    email: text(0)  # type: ignore[valid-type]
    password: text(1, strip=False)  # type: ignore[valid-type]


class Signup(Model):
    name: text(1, 80, min_msg="Enter your name")  # type: ignore[valid-type]
    email: email("Enter a valid email")  # type: ignore[valid-type]
    password: text(8, 200, min_msg="Use at least 8 characters", strip=False)  # type: ignore[valid-type]


@router.post("/auth/login")
def login(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "login", 20, 15 * 60)
    b = validate(Login, body)
    user = s.scalar(select(User).where(User.email == b.email.lower()))
    if not verify_password(b.password, user.passwordHash if user else None) or not user:
        raise HttpError(401, "That email and password don't match.")
    res = json_response({"ok": True})
    set_session(res, user.id)
    return res


@router.post("/auth/signup")
def signup(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "signup", 10, 60 * 60)
    b = validate(Signup, body)
    if s.scalar(select(User.id).where(User.email == b.email)):
        raise HttpError(409, "An account with this email already exists. Sign in instead.")
    user = User(name=b.name, email=b.email, passwordHash=hash_password(b.password))
    s.add(user)
    s.commit()
    # Convert a landing-page lead into a customer record.
    s.execute(update(Lead).where(Lead.email == b.email).values(source="converted"))
    s.commit()
    ensure_trial(s, user.id)
    res = json_response({"ok": True})
    set_session(res, user.id)
    return res


@router.post("/auth/logout")
def logout():
    res = json_response({"ok": True})
    clear_session(res)
    return res


# ── Credits popover ─────────────────────────────────────────────────────────


@router.get("/credits")
def credits(user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Balance, breakdown by source and the latest credit movements, for the sidebar popover."""
    summary = credit_summary(s, user.id)
    recent = s.scalars(select(CreditTransaction).where(CreditTransaction.userId == user.id).order_by(CreditTransaction.createdAt.desc()).limit(8)).all()
    return json_response(
        {
            "total": summary.total,
            "bySource": by_source(summary),
            "recent": [
                {"id": t.id, "delta": t.delta, "kind": t.kind, "description": t.description, "createdAt": t.createdAt, "refundedAt": t.refundedAt}
                for t in recent
            ],
        }
    )


# ── Admin: integrations and lead export ─────────────────────────────────────

_IDS = tuple(i["id"] for i in INTEGRATIONS)


class SaveIntegration(Model):
    id: Literal["google", "meta"]
    clientId: text(3, 300, min_msg="Enter the client/app ID")  # type: ignore[valid-type]
    clientSecret: text(0, 500) | None = None  # type: ignore[valid-type]


class RemoveIntegration(Model):
    id: Literal["google", "meta"]


@router.post("/admin/integrations")
def save_integration(body: JsonBody, _: User = Depends(require_admin), s: Session = Depends(get_db)):
    b = validate(SaveIntegration, body)
    existing = s.get(IntegrationSetting, b.id)
    info = next(i for i in INTEGRATIONS if i["id"] == b.id)
    secret_enc = encrypt(b.clientSecret) if b.clientSecret else (existing.clientSecretEnc if existing else None)
    if not secret_enc and not info["secretOptional"]:
        raise HttpError(400, f"Enter the {info['secretLabel'].lower()}.")
    if existing:
        existing.clientId, existing.clientSecretEnc = b.clientId, secret_enc
    else:
        s.add(IntegrationSetting(id=b.id, clientId=b.clientId, clientSecretEnc=secret_enc))
    s.commit()
    load_integrations(force=True)
    return json_response({"ok": True})


@router.delete("/admin/integrations")
def remove_integration(body: JsonBody, _: User = Depends(require_admin), s: Session = Depends(get_db)):
    b = validate(RemoveIntegration, body)
    row = s.get(IntegrationSetting, b.id)
    if row:
        s.delete(row)
        s.commit()
    load_integrations(force=True)
    return json_response({"ok": True})


def csv_cell(v: object) -> str:
    """Neutralises spreadsheet formula injection."""
    s = "" if v is None else str(v)
    return f"'{s}" if re.match(r"^[=+\-@\t\r]", s) else s


def to_csv(header: list[str], rows: list[list[object]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow([csv_cell(v) for v in r])
    return "﻿" + buf.getvalue().rstrip("\r\n")


@router.get("/admin/leads/export")
def export_leads(_: User = Depends(require_admin), s: Session = Depends(get_db)):
    leads = s.scalars(select(Lead).order_by(Lead.createdAt.desc())).all()
    cols = ["email", "source", "utmSource", "utmMedium", "utmCampaign", "referrer", "signups", "createdAt"]
    rows = [[iso(lead.createdAt) if c == "createdAt" else getattr(lead, c) for c in cols] for lead in leads]
    return Response(
        to_csv(cols, rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="leads-{utcnow().date().isoformat()}.csv"'},
    )


# ── Public lead capture (called by the landing site) ────────────────────────


class LeadBody(Model):
    email: email("Enter a valid email address")  # type: ignore[valid-type]
    source: text(0, 40, strip=False) | None = None  # type: ignore[valid-type]
    utmSource: text(0, 100, strip=False) | None = None  # type: ignore[valid-type]
    utmMedium: text(0, 100, strip=False) | None = None  # type: ignore[valid-type]
    utmCampaign: text(0, 100, strip=False) | None = None  # type: ignore[valid-type]
    referrer: text(0, 500, strip=False) | None = None  # type: ignore[valid-type]
    website: str | None = None  # honeypot: real people never fill this


@router.post("/leads")
def capture_lead(request: Request, body: JsonBody, s: Session = Depends(get_db)):
    rate_limit(request, "leads", 8, 10 * 60)
    b = validate(LeadBody, body)
    if b.website:
        return json_response({"ok": True})  # silently drop bots
    lead = s.scalar(select(Lead).where(Lead.email == b.email))
    if lead:
        lead.signups += 1
    else:
        s.add(
            Lead(
                email=b.email,
                source=b.source or "landing-hero",
                utmSource=b.utmSource or None,
                utmMedium=b.utmMedium or None,
                utmCampaign=b.utmCampaign or None,
                referrer=b.referrer or None,
                userAgent=(request.headers.get("user-agent") or "")[:300] or None,
            )
        )
    s.commit()
    return json_response({"ok": True})


# ── Public thumbnail proxy (Instagram pulls the post image from here) ───────

_THUMB_HOSTS = [re.compile(r"(^|\.)ytimg\.com$"), re.compile(r"(^|\.)vimeocdn\.com$"), re.compile(r"(^|\.)youtube\.com$")]


@router.get("/media/thumb/{clip_id}")
def clip_thumbnail(clip_id: str, s: Session = Depends(get_db)):
    """Public by design: ids are unguessable and only the public thumbnail is exposed."""
    from urllib.parse import urlsplit

    from ..models import Clip

    clip = s.get(Clip, clip_id)
    src = clip.video.thumbnailUrl if clip else None
    if not clip or not src or not any(r.search(urlsplit(src).hostname or "") for r in _THUMB_HOSTS):
        return Response("Not found", status_code=404)
    v = clip.video
    # Prefer the high-resolution YouTube frame when it exists.
    candidates = [f"https://i.ytimg.com/vi/{v.externalId}/maxresdefault.jpg", src] if v.platform == "youtube" and v.externalId else [src]
    for url in candidates:
        try:
            with httpx.Client(timeout=10, follow_redirects=True) as c:
                res = c.get(url, headers={"User-Agent": BROWSER_UA})
        except httpx.HTTPError:
            continue
        ctype = res.headers.get("content-type", "")
        if res.is_success and ctype.startswith("image/"):
            return Response(res.content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})
    return Response("Not found", status_code=404)


# ── Stats refresh and the publisher cron hook ───────────────────────────────


@router.post("/analytics/refresh")
def refresh_my_stats(request: Request, user: User = Depends(require_user)):
    rate_limit(request, f"stats:{user.id}", 6, 10 * 60)
    return json_response({"refreshed": refresh_stats(user_id=user.id, limit=100)})


@router.get("/cron/publish")
def cron_publish(request: Request):
    """For an external scheduler (when INTERNAL_SCHEDULER=false). Send `Authorization: Bearer $CRON_SECRET`."""
    if not settings.cron_secret:
        authorized = not settings.is_prod  # open locally, locked in production until CRON_SECRET is set
    else:
        authorized = hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {settings.cron_secret}")
    if not authorized:
        return Response("Unauthorized", status_code=401)
    return json_response({"ok": True, **run_publisher(), "at": utcnow()})


__all__ = ["router", "to_csv", "csv_cell", "_IDS"]
