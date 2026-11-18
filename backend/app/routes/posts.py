"""Posts (publish now or schedule), social account connections, and YouTube uploads."""

import logging
from datetime import timedelta

from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from pydantic import Field, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..auth import assert_can_connect_account, assert_can_queue_posts, current_user, has_access, require_subscriber, require_user
from ..background import after
from ..config import settings
from ..db import SessionLocal, get_db, utcnow
from ..http import HttpError, json_response, validate
from ..integrations import load_integrations
from ..models import Clip, OAuthState, Post, SocialAccount, User
from ..security import random_token, sha256_base64url
from ..social.base import PLATFORMS, PublishError, platform_length
from ..social.providers import account_context, finish_url, get_provider, redirect_uri_for, save_accounts
from ..social.publisher import publish_post
from ..social.youtube import YT_CHUNK, set_privacy, start_upload, upload_chunk, youtube_url
from .common import IsoDateTime, JsonBody, Model, api_router, not_found, text

log = logging.getLogger("shortlark.posts")
router = api_router()


class Target(Model):
    accountId: str
    text: text(1, min_msg="Post text can't be empty")  # type: ignore[valid-type]


class NewPosts(Model):
    clipId: str
    targets: list[Target]
    scheduledAt: IsoDateTime | None  # ISO time to schedule, or null to post now

    @field_validator("targets")
    @classmethod
    def at_least_one(cls, v: list[Target]) -> list[Target]:
        if not v:
            raise ValueError("Choose at least one account")
        return v


def _publish_all(ids: list[str]) -> None:
    for pid in ids:
        publish_post(pid)


@router.post("/posts")
def create_posts(body: JsonBody, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    b = validate(NewPosts, body)
    clip = s.scalar(select(Clip).where(Clip.id == b.clipId, Clip.userId == user.id))
    if not clip:
        raise not_found("Clip")
    wanted = {t.accountId for t in b.targets}
    accounts = {a.id: a for a in s.scalars(select(SocialAccount).where(SocialAccount.userId == user.id, SocialAccount.id.in_(wanted)))}
    if len(accounts) != len(wanted):
        raise HttpError(400, "Unknown account.")

    when = b.scheduledAt
    now = utcnow()
    if when and when < now - timedelta(minutes=1):
        raise HttpError(400, "That time is in the past.")
    if when and when > now + timedelta(days=180):
        raise HttpError(400, "Schedule within the next 6 months.")

    for t in b.targets:
        acc = accounts[t.accountId]
        info = PLATFORMS.get(acc.platform, {"label": acc.platform, "maxChars": 5000, "needsImage": False})
        if acc.platform == "youtube":
            raise HttpError(400, "YouTube needs a video file. Use the YouTube upload form on the clip.")
        if acc.status != "active":
            raise HttpError(400, f"{info['label']} ({acc.displayName}) needs to be reconnected.")
        if platform_length(acc.platform, t.text) > info["maxChars"]:
            raise HttpError(400, f"{info['label']} posts are limited to {info['maxChars']} characters.")
        if info["needsImage"] and not clip.video.thumbnailUrl:
            raise HttpError(400, f"{info['label']} needs an image, and this video has no thumbnail.")
    assert_can_queue_posts(s, user, len(b.targets))

    created: list[Post] = []
    for t in b.targets:
        acc = accounts[t.accountId]
        p = Post(
            userId=user.id,
            clipId=clip.id,
            accountId=acc.id,
            accountName=f"@{acc.username}" if acc.username else acc.displayName,
            platform=acc.platform,
            text=t.text,
            status="scheduled" if when else "queued",
            scheduledAt=when,
        )
        s.add(p)
        created.append(p)
    if clip.status in ("idea", "draft"):
        clip.status = "ready"
    s.commit()
    if not when:
        # Publish right after responding; the UI polls for the live link or failure reason.
        after(_publish_all, [p.id for p in created])
    return json_response({"ids": [p.id for p in created]}, 201)


def _own_post(s: Session, user: User, post_id: str) -> Post | None:
    return s.scalar(select(Post).where(Post.id == post_id, Post.userId == user.id))


@router.get("/posts/{post_id}")
def post_status(post_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    p = _own_post(s, user, post_id)
    if not p:
        raise not_found("Post")
    return json_response({"id": p.id, "status": p.status, "liveUrl": p.liveUrl, "error": p.error, "publishedAt": p.publishedAt, "scheduledAt": p.scheduledAt})


@router.post("/posts/{post_id}")
def post_now(post_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Post now (for queued/scheduled posts) or retry (for failed posts)."""
    p = _own_post(s, user, post_id)
    if not p:
        raise not_found("Post")
    if p.status not in ("queued", "scheduled", "failed"):
        raise HttpError(409, f"This post is already {p.status}.")
    p.scheduledAt = None
    p.status = "failed" if p.status == "failed" else "queued"
    s.commit()
    after(publish_post, post_id)
    return json_response({"ok": True})


@router.delete("/posts/{post_id}")
def cancel_post(post_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Cancels a queued, scheduled, failed or in-progress upload post."""
    p = _own_post(s, user, post_id)
    if not p or p.status not in ("queued", "scheduled", "failed", "uploading"):
        raise HttpError(409, "Only queued, scheduled, uploading or failed posts can be canceled.")
    # A scheduled YouTube upload already sits on the channel as private + publishAt: clear the schedule.
    if p.platform == "youtube" and p.externalId and p.status == "scheduled" and p.account:
        try:
            set_privacy(account_context(s, p.account), p.externalId, "private")
        except Exception as e:
            raise HttpError(502, f"Couldn't cancel on YouTube: {e}") from None
    p.status = "canceled"
    p.uploadUrl = None
    p.error = "Canceled. The video stays on your channel as private." if p.platform == "youtube" and p.externalId else None
    s.commit()
    return json_response({"ok": True})


# ── Social accounts ─────────────────────────────────────────────────────────


@router.delete("/social/accounts/{account_id}")
def disconnect(account_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Disconnects an account. Its pending posts are canceled; published history is kept with the account removed."""
    acc = s.scalar(select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.userId == user.id))
    if not acc:
        raise not_found("Account")
    s.execute(
        update(Post).where(Post.accountId == account_id, Post.status.in_(["queued", "scheduled"])).values(status="canceled", error="Account disconnected.")
    )
    s.delete(acc)
    s.commit()
    return json_response({"ok": True})


def _redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=302)


@router.get("/social/connect/{platform}")
def connect(platform: str, request: Request, s: Session = Depends(get_db)):
    """Starts "Log in with …" for a network, in a popup (or a full-page redirect when popups are blocked)."""
    popup = request.query_params.get("popup") == "1"

    def back(msg: str, ok: bool = False) -> RedirectResponse:
        return _redirect(finish_url(popup, ok, msg))

    user = current_user(request, s)
    if not user:
        return _redirect(f"{settings.app_url}/login")
    if not has_access(s, user):
        return back("You're out of credits. Buy credits or choose a plan to connect accounts.")
    load_integrations()
    provider = get_provider(platform)
    if not provider:
        return back("Unknown platform.")
    label = PLATFORMS.get(platform, {}).get("label", platform)
    if not provider.configured():
        return back(f"{label} sign-in isn't set up on this workspace yet.")
    if platform == "sandbox":
        save_accounts(s, user.id, "sandbox", provider.exchange(code="", redirect_uri=""))
        return back("Sandbox account added.", True)
    try:
        assert_can_connect_account(s, user)
    except HttpError as e:
        return back(e.message)

    s.execute(delete(OAuthState).where(OAuthState.createdAt < utcnow() - timedelta(minutes=30)))
    state = random_token(24)
    verifier = random_token(48) if provider.uses_pkce else None
    s.add(OAuthState(id=state, userId=user.id, platform=platform, verifier=verifier, popup=popup))
    s.commit()
    return _redirect(
        provider.authorize_url(state=state, redirect_uri=redirect_uri_for(platform), code_challenge=sha256_base64url(verifier) if verifier else None)
    )


@router.get("/social/callback/{platform}")
def callback(platform: str, request: Request, s: Session = Depends(get_db)):
    q = request.query_params
    state, code = q.get("state"), q.get("code")
    err = q.get("error_description") or q.get("error")

    # Consume the state first so we know whether this flow runs in a popup.
    saved = s.get(OAuthState, state) if state else None
    if saved:
        s.delete(saved)
        s.commit()
    popup = saved.popup if saved else False

    def back(msg: str, ok: bool = False) -> RedirectResponse:
        return _redirect(finish_url(popup, ok, msg))

    load_integrations()
    provider = get_provider(platform)
    if not provider:
        return back("Unknown platform.")
    if err:
        return back("You cancelled the sign-in." if err == "access_denied" else f"Sign-in was cancelled: {err}")
    if not state or not code:
        return back("The sign-in response was incomplete. Please try again.")
    user = current_user(request, s)
    if not user or not saved or saved.userId != user.id or saved.platform != platform:
        return back("This sign-in expired or belongs to another session. Please try again.")
    if utcnow() - saved.createdAt > timedelta(minutes=30):
        return back("This sign-in took too long. Please try again.")
    try:
        accounts = provider.exchange(code=code, redirect_uri=redirect_uri_for(platform), code_verifier=saved.verifier)
        save_accounts(s, user.id, platform, accounts)
        label = PLATFORMS.get(platform, {}).get("label", platform)
        return back(f"{label}: connected {', '.join(a.displayName for a in accounts)}.", True)
    except Exception as e:
        log.exception("social callback failed for %s", platform)
        return back(str(e) or "Connecting the account failed.")


# ── YouTube uploads (the browser streams the file in chunks; we relay them) ──


class StartUpload(Model):
    clipId: str
    accountId: str
    title: text(1, 100, min_msg="Add a title", max_msg="YouTube titles are limited to 100 characters")  # type: ignore[valid-type]
    description: text(0, 5000, max_msg="YouTube descriptions are limited to 5,000 characters", strip=False)  # type: ignore[valid-type]
    tags: list[text(1, 100)] = Field(default_factory=list, max_length=30)  # type: ignore[valid-type]
    privacy: str
    madeForKids: bool
    scheduledAt: IsoDateTime | None
    size: int = Field(gt=0)
    mimeType: str

    @field_validator("title")
    @classmethod
    def no_brackets(cls, v: str) -> str:
        if "<" in v or ">" in v:
            raise ValueError("YouTube titles can't contain < or >")
        return v

    @field_validator("privacy")
    @classmethod
    def privacy_value(cls, v: str) -> str:
        if v not in ("public", "unlisted", "private"):
            raise ValueError("Invalid option")
        return v

    @field_validator("size")
    @classmethod
    def max_size(cls, v: int) -> int:
        if v > 4 * 1024**3:
            raise ValueError("Files up to 4 GB are supported")
        return v

    @field_validator("mimeType")
    @classmethod
    def video_only(cls, v: str) -> str:
        if not v.startswith("video/"):
            raise ValueError("Choose a video file")
        return v


@router.post("/youtube/uploads")
def start_youtube_upload(body: JsonBody, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    """Opens a YouTube upload: creates the post record and a resumable session."""
    b = validate(StartUpload, body)
    clip = s.scalar(select(Clip).where(Clip.id == b.clipId, Clip.userId == user.id))
    account = s.scalar(select(SocialAccount).where(SocialAccount.id == b.accountId, SocialAccount.userId == user.id, SocialAccount.platform == "youtube"))
    if not clip:
        raise not_found("Clip")
    if not account:
        raise HttpError(404, "YouTube channel not found.")
    if account.status != "active":
        raise HttpError(400, "This YouTube channel needs to be reconnected.")
    when = b.scheduledAt
    now = utcnow()
    if when and when < now + timedelta(minutes=5):
        raise HttpError(400, "Schedule YouTube uploads at least 5 minutes ahead.")
    if when and when > now + timedelta(days=180):
        raise HttpError(400, "Schedule within the next 6 months.")
    if when:
        assert_can_queue_posts(s, user, 1)

    post = Post(
        userId=user.id,
        clipId=clip.id,
        accountId=account.id,
        accountName=f"@{account.username}" if account.username else account.displayName,
        platform="youtube",
        text=f"{b.title}\n\n{b.description}".strip(),
        status="uploading",
        scheduledAt=when,
        privacy="public" if when else b.privacy,
        uploadSize=b.size,
    )
    s.add(post)
    s.commit()
    try:
        post.uploadUrl = start_upload(
            account_context(s, account),
            title=b.title,
            description=b.description,
            tags=b.tags,
            privacy=b.privacy,
            publish_at=when,
            made_for_kids=b.madeForKids,
            size=b.size,
            mime_type=b.mimeType,
        )
        s.commit()
    except Exception as e:
        s.rollback()
        s.delete(s.get(Post, post.id))
        s.commit()
        raise HttpError(400 if isinstance(e, PublishError) else 502, str(e)) from None
    return json_response({"postId": post.id, "chunkSize": YT_CHUNK}, 201)


def _relay_chunk(request: Request, post_id: str, offset_raw: str | None, chunk: bytes):
    with SessionLocal() as s:
        user = require_user(request, s)
        post = _own_post(s, user, post_id)
        if not post:
            raise HttpError(404, "Upload not found.")
        if post.status != "uploading" or not post.uploadUrl or not post.uploadSize:
            raise HttpError(409, "This upload is no longer active.")
        try:
            offset = int(offset_raw or "")
        except ValueError:
            offset = -1
        if offset < 0 or offset >= post.uploadSize:
            raise HttpError(400, "Bad offset.")
        is_last = offset + len(chunk) == post.uploadSize
        if not chunk or len(chunk) > YT_CHUNK or (not is_last and len(chunk) % 262144 != 0):
            raise HttpError(400, "Bad chunk size.")
        try:
            r = upload_chunk(post.uploadUrl, chunk, offset, post.uploadSize)
        except Exception as e:
            retryable = isinstance(e, PublishError) and e.retryable
            if not retryable:
                post.status, post.uploadUrl, post.error = "failed", None, str(e)
                s.commit()
            raise HttpError(503 if retryable else 502, str(e)) from None
        if not r["done"]:
            post.updatedAt = utcnow()
            s.commit()
            return json_response({"done": False, "received": r["received"]})

        video_id = r["video"]["id"]
        scheduled = bool(post.scheduledAt and post.scheduledAt > utcnow())
        post.externalId = video_id
        post.uploadUrl = None
        post.status = "scheduled" if scheduled else "published"
        post.publishedAt = None if scheduled else utcnow()
        post.liveUrl = youtube_url(video_id)
        post.error = None
        s.execute(update(Clip).where(Clip.id == post.clipId).values(status="ready" if scheduled else "published"))
        s.commit()
        return json_response({"done": True, "videoId": video_id, "url": youtube_url(video_id), "scheduled": scheduled})


@router.put("/youtube/uploads/{post_id}")
async def youtube_upload_chunk(post_id: str, request: Request):
    """Receives one chunk of the clip file (raw body, ?offset=N) and relays it into the YouTube session."""
    chunk = await request.body()
    return await run_in_threadpool(_relay_chunk, request, post_id, request.query_params.get("offset"), chunk)
