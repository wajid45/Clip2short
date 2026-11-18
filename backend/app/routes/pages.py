"""Page data for the web app: one GET per screen, under /api/page.

Each loader enforces auth itself (401 signed out, 402 out of credits, 404 not yours).
Response shapes are typed for the web app in shared/src/api-types.ts.
"""

import json
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai.client import ai_configured
from ..auth import is_admin, require_admin, require_subscriber, require_user
from ..clips import clip_order, clip_where, filters_from_params
from ..config import billing_configured, dev_billing_bypass, settings
from ..credits import by_source, credit_summary, ensure_trial
from ..db import get_db, utcnow
from ..http import json_response
from ..integrations import INTEGRATIONS, cred, integration_for, is_configured, load_integrations
from ..models import Clip, CreditTransaction, IntegrationSetting, Lead, Post, SocialAccount, User, Video
from ..plans import analysis_cost, get_plan, has_active_subscription, limits_for
from ..social.providers import PROVIDERS
from ..video.pipeline import get_segments

router = APIRouter(prefix="/api/page")
NO_STORE = {"Cache-Control": "no-store"}
MOMENTS_PAGE = 30
LIBRARY_LIMIT = 500


def page(data: object):
    return json_response(data, headers=NO_STORE)


@router.get("/me")
def me(user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Signed-in user summary for the app shell (sidebar, credits card)."""
    if not user.trialStartedAt:
        ensure_trial(s, user.id)  # accounts created before credits existed
    plan = get_plan(user.plan) if has_active_subscription(user) else None
    return page(
        {
            "name": user.name or user.email.split("@")[0],
            "email": user.email,
            "planName": plan["name"] if plan else None,
            "credits": credit_summary(s, user.id).total,
            "monthlyCredits": plan["monthlyCredits"] if plan else None,
            "isAdmin": is_admin(user),
        }
    )


@router.get("/videos")
def videos(user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    rows = s.scalars(select(Video).where(Video.userId == user.id).order_by(Video.createdAt.desc())).all()
    stats = {
        vid: (n, top)
        for vid, n, top in s.execute(select(Clip.videoId, func.count(), func.max(Clip.score)).where(Clip.userId == user.id).group_by(Clip.videoId)).all()
    }
    out = []
    for v in rows:
        clip_count, top = stats.get(v.id, (0, None))
        has_clip = clip_count > 0
        out.append(
            {
                "id": v.id,
                "title": v.title,
                "author": v.author,
                "platform": v.platform,
                "durationSec": v.durationSec,
                "thumbnailUrl": v.thumbnailUrl,
                "createdAt": v.createdAt,
                "captionStatus": v.captionStatus,
                "analysisStatus": v.analysisStatus,
                "analysisError": v.analysisError,
                "_count": {"clips": clip_count},
                "clips": [{"score": top}] if has_clip else [],
            }
        )
    return page({"videos": out, "aiConfigured": ai_configured()})


@router.get("/videos/{video_id}")
def video(video_id: str, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    from ..http import HttpError

    v = s.scalar(select(Video).where(Video.id == video_id, Video.userId == user.id))
    if not v:
        raise HttpError(404, "Video not found.")
    clips = s.scalars(select(Clip).where(Clip.videoId == v.id).order_by(Clip.score.is_(None), Clip.score.desc(), Clip.startSec.asc())).all()
    segments = get_segments(v.transcriptJson)
    duration = v.durationSec or max([0, *(c.endSec for c in clips), float(segments[-1]["end"]) if segments else 0])
    cost = analysis_cost(duration or 60, v.analysisCount > 0)
    data = v.to_dict(exclude=("transcriptJson",))  # the transcript can be large; the page only needs its size
    data["clips"] = [c.to_dict() for c in clips]
    return page(
        {
            "video": data,
            "segmentCount": len(segments),
            "duration": duration,
            "cost": cost,
            "balance": credit_summary(s, user.id).total,
            "aiConfigured": ai_configured(),
        }
    )


@router.get("/clips/{clip_id}")
def clip(clip_id: str, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    from ..http import HttpError

    c = s.scalar(select(Clip).where(Clip.id == clip_id, Clip.userId == user.id))
    if not c:
        raise HttpError(404, "Clip not found.")
    v = c.video
    siblings = s.scalars(select(Clip).where(Clip.videoId == c.videoId)).all()
    accounts = s.scalars(
        select(SocialAccount).where(SocialAccount.userId == user.id).order_by(SocialAccount.platform.asc(), SocialAccount.displayName.asc())
    ).all()
    posts = s.scalars(select(Post).where(Post.clipId == c.id).order_by(Post.createdAt.desc())).all()
    clip_fields = (
        "id title startSec endSec status category hook caption hashtags notes transcript score scoreHook scoreSelf scorePayoff scoreQuote reason origin"
    ).split()
    return page(
        {
            "clip": {k: getattr(c, k) for k in clip_fields},
            "video": {
                "id": v.id,
                "title": v.title,
                "platform": v.platform,
                "externalId": v.externalId,
                "sourceUrl": v.sourceUrl,
                "durationSec": v.durationSec,
                "captionTiming": v.captionTiming,
            },
            "siblings": [{"id": x.id, "title": x.title, "startSec": x.startSec, "endSec": x.endSec, "status": x.status} for x in siblings],
            "segments": get_segments(v.transcriptJson),
            "suggestion": json.loads(c.suggestionsJson) if c.suggestionsJson else None,
            "canDownload": v.platform == "direct",
            "accounts": [{"id": a.id, "platform": a.platform, "displayName": a.displayName, "username": a.username, "status": a.status} for a in accounts],
            "posts": [
                {
                    "id": p.id,
                    "platform": p.platform,
                    "accountName": p.accountName,
                    "status": p.status,
                    "text": p.text,
                    "scheduledAt": p.scheduledAt,
                    "publishedAt": p.publishedAt,
                    "liveUrl": p.liveUrl,
                    "error": p.error,
                }
                for p in posts
            ],
        }
    )


@router.get("/moments")
def moments(request: Request, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    q = request.query_params

    def num(key: str, default: int) -> int:
        try:
            return int(float(q.get(key) or default))
        except ValueError:
            return default

    min_score = num("min", 0)
    page_no = max(1, num("page", 1))
    unposted = q.get("unposted") == "1"
    where = [Clip.userId == user.id, Clip.score.is_not(None)]
    if min_score:
        where.append(Clip.score >= min_score)
    if unposted:
        where.append(Clip.status != "published")
    rows = s.scalars(
        select(Clip).where(*where).order_by(Clip.score.desc(), Clip.createdAt.desc()).offset((page_no - 1) * MOMENTS_PAGE).limit(MOMENTS_PAGE)
    ).all()
    total = s.scalar(select(func.count()).select_from(Clip).where(*where)) or 0
    clips = [{**c.to_dict(), "video": {"id": c.video.id, "title": c.video.title, "thumbnailUrl": c.video.thumbnailUrl}} for c in rows]
    return page({"clips": clips, "total": total, "page": page_no, "min": min_score, "unposted": unposted, "pageSize": MOMENTS_PAGE})


@router.get("/library")
def library(request: Request, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    where = clip_where(user.id, filters_from_params(request.query_params))
    rows = s.scalars(select(Clip).where(*where).order_by(*clip_order(request.query_params.get("sort"))).limit(LIBRARY_LIMIT)).all()
    total = s.scalar(select(func.count()).select_from(Clip).where(*where)) or 0
    published = (
        dict(s.execute(select(Post.clipId, func.count()).where(Post.clipId.in_([c.id for c in rows]), Post.status == "published").group_by(Post.clipId)).all())
        if rows
        else {}
    )
    return page(
        {
            "total": total,
            "limit": LIBRARY_LIMIT,
            "rows": [
                {
                    "id": c.id,
                    "title": c.title,
                    "status": c.status,
                    "score": c.score,
                    "category": c.category,
                    "startSec": c.startSec,
                    "endSec": c.endSec,
                    "videoTitle": c.video.title,
                    "source": c.video.platform,
                    "updatedAt": c.updatedAt,
                    "posts": published.get(c.id, 0),
                }
                for c in rows
            ],
        }
    )


@router.get("/queue")
def queue(request: Request, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    history = request.query_params.get("view") == "history"
    q = select(Post).where(Post.userId == user.id)
    if history:
        q = q.where(Post.status.in_(["published", "canceled"])).order_by(Post.publishedAt.is_(None), Post.publishedAt.desc(), Post.updatedAt.desc()).limit(200)
    else:
        q = q.where(Post.status.in_(["queued", "scheduled", "publishing", "failed"])).order_by(Post.scheduledAt.is_not(None), Post.scheduledAt.asc()).limit(500)
    posts = s.scalars(q).all()
    return page(
        {
            "history": history,
            "posts": [
                {
                    "id": p.id,
                    "platform": p.platform,
                    "accountName": p.accountName,
                    "status": p.status,
                    "text": p.text,
                    "error": p.error,
                    "liveUrl": p.liveUrl,
                    "scheduledAt": p.scheduledAt,
                    "publishedAt": p.publishedAt,
                    "createdAt": p.createdAt,
                    "updatedAt": p.updatedAt,
                    "clip": {"id": p.clip.id, "title": p.clip.title, "video": {"title": p.clip.video.title}},
                }
                for p in posts
            ],
        }
    )


@router.get("/analytics")
def analytics(request: Request, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    r = request.query_params.get("range") or ""
    rng = r if r in ("7", "30", "90") else "30"
    since = utcnow() - timedelta(days=int(rng))
    posts = s.scalars(select(Post).where(Post.userId == user.id, Post.status == "published", Post.publishedAt >= since)).all()
    failed = s.scalar(select(func.count()).select_from(Post).where(Post.userId == user.id, Post.status == "failed", Post.updatedAt >= since)) or 0
    queued = s.scalar(select(func.count()).select_from(Post).where(Post.userId == user.id, Post.status.in_(["queued", "scheduled"]))) or 0

    def total(key: str, items=posts) -> int:
        return sum(getattr(p, key) or 0 for p in items)

    totals = {"posts": len(posts), "views": total("views"), "likes": total("likes"), "comments": total("comments"), "shares": total("shares")}
    engagement = (totals["likes"] + totals["comments"] + totals["shares"]) / totals["views"] * 100 if totals["views"] else None
    platforms = list(dict.fromkeys(p.platform for p in posts))
    by_platform = sorted(
        (
            {
                "platform": pl,
                "posts": len(items := [p for p in posts if p.platform == pl]),
                "views": total("views", items),
                "likes": total("likes", items),
                "comments": total("comments", items),
                "shares": total("shares", items),
            }
            for pl in platforms
        ),
        key=lambda x: x["views"],
        reverse=True,
    )
    top = sorted(posts, key=lambda p: (-(p.views or 0), -(p.likes or 0)))[:10]
    last_update = max((p.statsUpdatedAt for p in posts if p.statsUpdatedAt), default=None)
    return page(
        {
            "range": rng,
            "totals": totals,
            "engagement": engagement,
            "byPlatform": by_platform,
            "top": [
                {
                    "id": p.id,
                    "platform": p.platform,
                    "accountName": p.accountName,
                    "publishedAt": p.publishedAt,
                    "liveUrl": p.liveUrl,
                    "views": p.views,
                    "likes": p.likes,
                    "comments": p.comments,
                    "clip": {"id": p.clip.id, "title": p.clip.title},
                }
                for p in top
            ],
            "lastUpdate": last_update,
            "failedCount": failed,
            "scheduledCount": queued,
        }
    )


ORDER = ["youtube", "instagram", "facebook", "sandbox"]


@router.get("/accounts")
def accounts(user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    load_integrations()
    rows = s.scalars(select(SocialAccount).where(SocialAccount.userId == user.id).order_by(SocialAccount.createdAt.asc())).all()
    admin = is_admin(user)
    platforms = []
    for p in ORDER:
        if p == "sandbox" and not PROVIDERS["sandbox"].configured():
            continue
        integration = integration_for(p) if admin else None
        platforms.append(
            {
                "id": p,
                "configured": PROVIDERS[p].configured(),
                "integrationId": integration["id"] if integration else None,
                "integrationName": integration["name"] if integration else None,
            }
        )
    return page(
        {
            "accounts": [
                {"id": a.id, "platform": a.platform, "displayName": a.displayName, "username": a.username, "avatarUrl": a.avatarUrl, "status": a.status}
                for a in rows
            ],
            "platforms": platforms,
            "connectedCount": sum(1 for a in rows if a.platform != "sandbox"),
            "accountLimit": limits_for(user)["socialAccounts"],
            "isAdmin": admin,
        }
    )


@router.get("/billing")
def billing(request: Request, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Billing is reachable without credits (it's where you buy them), so it only needs a signed-in user."""
    tab = "history" if request.query_params.get("tab") == "history" else "plan"
    summary = credit_summary(s, user.id)
    history = None
    if tab == "history":
        rows = s.scalars(select(CreditTransaction).where(CreditTransaction.userId == user.id).order_by(CreditTransaction.createdAt.desc()).limit(200)).all()
        added = s.scalar(select(func.sum(CreditTransaction.delta)).where(CreditTransaction.userId == user.id, CreditTransaction.kind == "grant")) or 0
        used = (
            s.scalar(
                select(func.sum(CreditTransaction.delta)).where(
                    CreditTransaction.userId == user.id, CreditTransaction.kind == "spend", CreditTransaction.refundedAt.is_(None)
                )
            )
            or 0
        )
        count = s.scalar(select(func.count()).select_from(CreditTransaction).where(CreditTransaction.userId == user.id)) or 0
        history = {
            "rows": [
                {"id": t.id, "delta": t.delta, "kind": t.kind, "description": t.description, "createdAt": t.createdAt, "refundedAt": t.refundedAt} for t in rows
            ],
            "added": added,
            "used": abs(used),
            "count": count,
        }
    return page(
        {
            "tab": tab,
            "mode": "stripe" if billing_configured() else "dev" if dev_billing_bypass() else "unavailable",
            "active": has_active_subscription(user),
            "plan": user.plan,
            "subscriptionStatus": user.subscriptionStatus,
            "currentPeriodEnd": user.currentPeriodEnd,
            "cancelAtPeriodEnd": user.cancelAtPeriodEnd,
            "hasStripeCustomer": bool(user.stripeCustomerId),
            "credits": {"total": summary.total, "bySource": by_source(summary)},
            "history": history,
        }
    )


@router.get("/admin/leads")
def leads(_: User = Depends(require_admin), s: Session = Depends(get_db)):
    rows = s.scalars(select(Lead).order_by(Lead.createdAt.desc()).limit(1000)).all()
    keys = ("id", "email", "source", "utmSource", "utmMedium", "utmCampaign", "referrer", "createdAt")
    return page(
        {
            "leads": [{k: getattr(lead, k) for k in keys} for lead in rows],
            "total": s.scalar(select(func.count()).select_from(Lead)) or 0,
            "converted": s.scalar(select(func.count()).select_from(Lead).where(Lead.source == "converted")) or 0,
        }
    )


@router.get("/admin/integrations")
def integrations(_: User = Depends(require_admin), s: Session = Depends(get_db)):
    load_integrations(force=True)
    saved = {r.id: r for r in s.scalars(select(IntegrationSetting)).all()}
    out = []
    for i in INTEGRATIONS:
        c = cred(i["id"])
        row = saved.get(i["id"])
        out.append(
            {
                "id": i["id"],
                "name": i["name"],
                "platforms": i["platforms"],
                "steps": i["steps"],
                "consoleUrl": i["consoleUrl"],
                "idLabel": i["idLabel"],
                "secretLabel": i["secretLabel"],
                "secretOptional": i["secretOptional"],
                "live": is_configured(i["id"]),
                "redirectUris": [f"{settings.app_url}/api/social/callback/{p}" for p in i["platforms"]],
                "savedClientId": row.clientId if row else (c.id or "" if c.source == "env" else ""),
                "hasSavedSecret": bool(row and row.clientSecretEnc),
                "source": c.source,
            }
        )
    return page({"integrations": out})
