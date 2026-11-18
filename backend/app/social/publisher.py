"""Publishing: claims due posts atomically, publishes them, confirms pending ones and refreshes stats."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, utcnow
from ..integrations import load_integrations
from ..models import Clip, Post
from ..video.source import timestamp_url
from .base import AccountContext, PublishError, PublishInput, PublishResult
from .providers import account_context, get_provider
from .youtube import get_video, set_privacy, youtube_url

log = logging.getLogger("shortlark.publisher")
MAX_ATTEMPTS = 3


def clip_image_url(clip_id: str) -> str:
    """Thumbnail URL served from our own domain (Instagram pulls the post image from it)."""
    return f"{settings.app_url}/api/media/thumb/{clip_id}"


def _mark_clip_published(s: Session, clip_id: str) -> None:
    s.execute(update(Clip).where(Clip.id == clip_id).values(status="published"))
    s.commit()


def publish_post(post_id: str) -> None:
    """Publishes one post. Claims it atomically (status → publishing) so concurrent runs can't double-publish."""
    load_integrations()
    with SessionLocal() as s:
        claimed = s.execute(
            update(Post)
            .where(Post.id == post_id, Post.status.in_(["queued", "scheduled", "failed"]))
            .values(status="publishing", attempts=Post.attempts + 1, error=None)
        ).rowcount
        s.commit()
        if not claimed:
            return
        post = s.get(Post, post_id)
        assert post is not None
        provider = get_provider(post.platform)
        try:
            if not provider or not provider.configured():
                raise PublishError(f"{post.platform} publishing isn't configured on this server.")
            if not post.account:
                raise PublishError("The account for this post was disconnected.")
            if post.account.status != "active":
                raise PublishError("This account needs to be reconnected.")
            ctx = account_context(s, post.account)
            if post.platform == "youtube":
                _confirm_youtube(s, ctx, post, post.privacy or "public")
                _mark_clip_published(s, post.clipId)
                return
            v = post.clip.video
            result = provider.publish(
                ctx,
                PublishInput(
                    text=post.text,
                    title=post.clip.title,
                    link=timestamp_url(v.platform, v.sourceUrl, v.externalId, post.clip.startSec),
                    imageUrl=clip_image_url(post.clipId) if v.thumbnailUrl else None,
                ),
            )
            post.status = "publishing" if result.pending else "published"
            post.externalId = result.externalId
            post.liveUrl = result.liveUrl
            post.publishedAt = None if result.pending else utcnow()
            s.commit()
            if not result.pending:
                _mark_clip_published(s, post.clipId)
        except Exception as e:
            s.rollback()
            post = s.get(Post, post_id)
            assert post is not None
            message = str(e)
            retry = isinstance(e, PublishError) and e.retryable and post.attempts < MAX_ATTEMPTS
            post.status = "scheduled" if retry else "failed"
            if retry:
                # Back off 15 minutes so the next scheduler tick retries a transient failure.
                post.scheduledAt = utcnow() + timedelta(minutes=15)
            post.error = f"Temporary error, retrying: {message}" if retry else message
            s.commit()


def _confirm_youtube(s: Session, ctx: AccountContext, post: Post, privacy: str) -> None:
    """YouTube posts are uploaded up front; publishing means making sure the video has the requested visibility."""
    if not post.externalId:
        raise PublishError("The video upload never finished. Upload it again from the clip.")
    video = get_video(ctx, post.externalId)
    if not video:
        raise PublishError("This video no longer exists on YouTube.")
    st = video.get("status") or {}
    if st.get("uploadStatus") in ("rejected", "failed"):
        reason = st.get("rejectionReason") or st.get("failureReason") or "no reason given"
        raise PublishError(f"YouTube {st['uploadStatus']} the video ({reason}).")
    if st.get("privacyStatus") != privacy:
        set_privacy(ctx, post.externalId, privacy)
        video = get_video(ctx, post.externalId)
        if ((video or {}).get("status") or {}).get("privacyStatus") != privacy:
            raise PublishError(
                "YouTube kept the video private. Videos uploaded through a Google API project that hasn't passed YouTube's audit are locked to private."
            )
    post.status, post.publishedAt, post.liveUrl, post.error = "published", utcnow(), youtube_url(post.externalId), None
    s.commit()


def _confirm_pending(s: Session) -> None:
    pending = s.scalars(
        select(Post).where(Post.status == "publishing", Post.externalId.is_not(None), Post.updatedAt < utcnow() - timedelta(minutes=1)).limit(50)
    ).all()
    for p in pending:
        provider = get_provider(p.platform)
        if not provider or not provider.supports_pending or not p.externalId or not p.account:
            continue
        try:
            r = provider.check_pending(account_context(s, p.account), p.externalId)
            if r is None:
                continue
            if isinstance(r, str):
                p.status, p.error = "failed", r
                s.commit()
            elif isinstance(r, PublishResult):
                p.status, p.externalId, p.liveUrl, p.publishedAt = "published", r.externalId, r.liveUrl, utcnow()
                s.commit()
                _mark_clip_published(s, p.clipId)
        except Exception:
            log.exception("pending check failed for %s", p.id)


def _recover_stuck(s: Session) -> None:
    """Recovers posts stuck mid-upload or mid-publish (e.g. the server restarted)."""
    s.execute(
        update(Post)
        .where(Post.status == "uploading", Post.updatedAt < utcnow() - timedelta(hours=6))
        .values(status="failed", uploadUrl=None, error="The upload didn't finish. Upload the file again from the clip.")
    )
    s.execute(
        update(Post)
        .where(Post.status == "publishing", Post.externalId.is_(None), Post.updatedAt < utcnow() - timedelta(minutes=20))
        .values(status="failed", error="Publishing was interrupted. Check the platform before retrying to avoid a duplicate.")
    )
    s.commit()


def run_publisher() -> dict[str, int]:
    """Runs every 15 minutes: publishes due posts, confirms pending ones, and refreshes stats."""
    load_integrations(force=True)
    with SessionLocal() as s:
        _recover_stuck(s)
        due = s.scalars(
            select(Post.id)
            .where(Post.status.in_(["queued", "scheduled"]), or_(Post.scheduledAt.is_(None), Post.scheduledAt <= utcnow()))
            .order_by(Post.scheduledAt.asc())
            .limit(100)
        ).all()
    for pid in due:
        publish_post(pid)
    with SessionLocal() as s:
        _confirm_pending(s)
        counts = (
            dict(
                s.execute(select(Post.status, func.count()).where(Post.id.in_(due)).group_by(Post.status)).all()  # type: ignore[arg-type]
            )
            if due
            else {}
        )
    checked = refresh_stats()
    return {"published": counts.get("published", 0), "failed": counts.get("failed", 0), "checked": checked}


def refresh_stats(user_id: str | None = None, limit: int = 60) -> int:
    """Pulls live stats for posts published in the last 30 days, oldest refresh first."""
    load_integrations()
    n = 0
    with SessionLocal() as s:
        q = select(Post).where(Post.status == "published", Post.externalId.is_not(None), Post.publishedAt >= utcnow() - timedelta(days=30))
        if user_id:
            q = q.where(Post.userId == user_id)
        posts = s.scalars(q.order_by(Post.statsUpdatedAt.is_not(None), Post.statsUpdatedAt.asc()).limit(limit)).all()
        for p in posts:
            provider = get_provider(p.platform)
            if not provider or not p.externalId or not p.account:
                continue
            try:
                st = provider.stats(account_context(s, p.account), p.externalId) or {}
                # Keep the previous number when the platform doesn't report one.
                for key in ("views", "likes", "comments", "shares"):
                    if st.get(key) is not None:
                        setattr(p, key, st[key])
                p.statsUpdatedAt = utcnow()
                s.commit()
                n += 1
            except Exception as e:
                s.rollback()
                p.statsUpdatedAt = utcnow()
                s.commit()
                log.warning("stats refresh failed for %s: %s", p.id, e)
    return n
