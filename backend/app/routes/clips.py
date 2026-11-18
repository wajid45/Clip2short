"""Clips: manual creation, edits, bulk actions, export, AI posting copy and MP4 downloads."""

import json
import logging
import re
import threading
from typing import Literal

from fastapi import Depends, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..ai.client import ai_configured, describe_ai_error
from ..ai.clipper import CATEGORIES
from ..ai.suggest import suggest_copy
from ..auth import require_subscriber, require_user
from ..captions.parse import transcript_text
from ..clips import CLIP_STATUSES, clip_order, clip_where, filters_from_params
from ..credits import InsufficientCredits, refund_credits, spend_credits
from ..db import get_db, utcnow
from ..http import HttpError, dumps, iso, json_response, validate
from ..models import Clip, User, Video
from ..ratelimit import rate_limit
from ..video.cut import MAX_DOWNLOAD_SEC, spawn_cut
from ..video.fetcher import assert_public_url
from ..video.pipeline import get_segments
from ..video.source import timestamp_url
from .account import to_csv
from .common import JsonBody, Model, api_router, not_found, text

log = logging.getLogger("shortlark.clips")
router = api_router()

SUGGEST_COST = 1
MAX_RENDER_SECONDS = 300  # hard cap on one render, so a stuck ffmpeg never holds a worker forever


class NewClip(Model):
    videoId: str
    title: text(1, 120) = "New clip"  # type: ignore[valid-type]
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)


@router.post("/clips")
def create_clip(body: JsonBody, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    """Manual clip creation from the editor."""
    b = validate(NewClip, body)
    video = s.scalar(select(Video).where(Video.id == b.videoId, Video.userId == user.id))
    if not video:
        raise not_found("Video")
    if b.endSec - b.startSec < 1:
        raise HttpError(400, "A clip must be at least 1 second long.")
    if video.durationSec and b.endSec > video.durationSec + 1:
        raise HttpError(400, "The out point is past the end of the video.")
    clip = Clip(
        userId=user.id,
        videoId=video.id,
        origin="manual",
        status="draft",
        title=b.title,
        startSec=b.startSec,
        endSec=b.endSec,
        transcript=transcript_text(get_segments(video.transcriptJson), b.startSec, b.endSec),
    )
    s.add(clip)
    s.commit()
    return json_response({"id": clip.id}, 201)


class Bulk(Model):
    action: Literal["status", "delete"]
    ids: list[str] = Field(min_length=1, max_length=1000)
    status: Literal["idea", "draft", "ready", "published"] | None = None


@router.post("/clips/bulk")
def bulk(body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    b = validate(Bulk, body)
    where = (Clip.id.in_(b.ids), Clip.userId == user.id)
    if b.action == "delete":
        count = s.execute(delete(Clip).where(*where)).rowcount
    else:
        if not b.status:
            raise HttpError(400, "status: Invalid option")
        count = s.execute(update(Clip).where(*where).values(status=b.status, updatedAt=utcnow())).rowcount
    s.commit()
    return json_response({"count": count})


@router.get("/clips/export")
def export_clips(request: Request, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Exports clips (selected ids, or the current filters) as CSV or JSON."""
    q = request.query_params
    fmt = "json" if q.get("format") == "json" else "csv"
    ids = [i for i in (q.get("ids") or "").split(",") if i]
    where = [Clip.userId == user.id, Clip.id.in_(ids)] if ids else clip_where(user.id, filters_from_params(q))
    clips = s.scalars(select(Clip).where(*where).order_by(*clip_order(q.get("sort")))).all()

    from ..captions.parse import _num  # whole numbers as ints, as the previous export wrote them

    def tc(sec: float) -> str:
        from math import floor

        h = floor(sec / 3600)
        rest = sec - h * 3600
        m = floor(rest / 60)
        rest -= m * 60
        whole = floor(rest)
        tenths = floor((rest - whole) * 10)
        mm = f"{m:02d}" if h > 0 else str(m)
        return f"{f'{h}:' if h > 0 else ''}{mm}:{whole:02d}.{tenths}"

    rows = [
        {
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "score": c.score,
            "category": c.category,
            "video": c.video.title,
            "source": c.video.platform,
            "start": tc(c.startSec),
            "end": tc(c.endSec),
            "startSec": _num(c.startSec),
            "endSec": _num(c.endSec),
            "durationSec": _num(round((c.endSec - c.startSec) * 10) / 10),
            "link": timestamp_url(c.video.platform, c.video.sourceUrl, c.video.externalId, c.startSec),
            "hook": c.hook,
            "caption": c.caption,
            "hashtags": c.hashtags,
            "reason": c.reason,
            "notes": c.notes,
            "transcript": c.transcript,
        }
        for c in clips
    ]
    stamp = utcnow().date().isoformat()
    if fmt == "json":
        return Response(
            dumps(rows, indent=2),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="clips-{stamp}.json"'},
        )
    header = list(rows[0].keys()) if rows else ["id"]
    return Response(
        to_csv(header, [[r[h] for h in header] for r in rows]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="clips-{stamp}.csv"'},
    )


class ClipPatch(Model):
    title: text(1, 120) | None = None  # type: ignore[valid-type]
    startSec: float | None = Field(default=None, ge=0)
    endSec: float | None = Field(default=None, gt=0)
    status: Literal["idea", "draft", "ready", "published"] | None = None
    category: Literal["insight", "story", "humor", "hot-take", "how-to", "emotional", "data", "quote", "event"] | None = None
    hook: text(0, 500, strip=False) | None = None  # type: ignore[valid-type]
    caption: text(0, 5000, strip=False) | None = None  # type: ignore[valid-type]
    hashtags: text(0, 500, strip=False) | None = None  # type: ignore[valid-type]
    notes: text(0, 10000, strip=False) | None = None  # type: ignore[valid-type]


assert set(CATEGORIES) == {"insight", "story", "humor", "hot-take", "how-to", "emotional", "data", "quote", "event"}
assert CLIP_STATUSES == ("idea", "draft", "ready", "published")


def _own_clip(s: Session, user: User, clip_id: str) -> Clip:
    clip = s.scalar(select(Clip).where(Clip.id == clip_id, Clip.userId == user.id))
    if not clip:
        raise not_found("Clip")
    return clip


@router.patch("/clips/{clip_id}")
def edit_clip(clip_id: str, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    clip = _own_clip(s, user, clip_id)
    b = validate(ClipPatch, body)
    sent = b.model_fields_set
    start = b.startSec if b.startSec is not None else clip.startSec
    end = b.endSec if b.endSec is not None else clip.endSec
    if end - start < 1:
        raise HttpError(400, "The out point must be at least 1 second after the in point.")
    if clip.video.durationSec and end > clip.video.durationSec + 1:
        raise HttpError(400, "The out point is past the end of the video.")
    for field in ("title", "startSec", "endSec", "status", "hook", "caption", "notes"):
        if field in sent and getattr(b, field) is not None:
            setattr(clip, field, getattr(b, field))
    if "category" in sent:
        clip.category = b.category  # may be cleared with null
    if "hashtags" in sent and b.hashtags is not None:
        clip.hashtags = re.sub(r"\s+", " ", b.hashtags.replace("#", "")).strip()
    if "startSec" in sent or "endSec" in sent:
        clip.transcript = transcript_text(get_segments(clip.video.transcriptJson), start, end)
    s.commit()
    return json_response({"clip": clip.to_dict()})


@router.delete("/clips/{clip_id}")
def delete_clip(clip_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    count = s.execute(delete(Clip).where(Clip.id == clip_id, Clip.userId == user.id)).rowcount
    s.commit()
    if not count:
        raise not_found("Clip")
    return json_response({"ok": True})


@router.post("/clips/{clip_id}/suggest")
def suggest(clip_id: str, request: Request, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    """AI posting copy for a clip (1 credit, refunded if it fails). Nothing is applied until the user approves."""
    clip = _own_clip(s, user, clip_id)
    if not ai_configured():
        raise HttpError(503, "AI suggestions aren't configured on this server (missing ANTHROPIC_API_KEY).")
    rate_limit(request, f"suggest:{user.id}", 30, 60 * 60)
    try:
        spend_id = spend_credits(s, user.id, SUGGEST_COST, f"AI posting copy for “{clip.title[:80]}”", clip.videoId)
    except InsufficientCredits:
        raise HttpError(402, "You need 1 credit for AI suggestions. Buy credits in Billing.", "no_credits") from None
    try:
        suggestion = suggest_copy(
            video_title=clip.video.title,
            video_description=clip.video.description,
            author=clip.video.author,
            clip_title=clip.title,
            transcript=clip.transcript,
            duration_sec=clip.endSec - clip.startSec,
            current_hook=clip.hook,
            current_caption=clip.caption,
        )
    except Exception as e:
        log.exception("suggestion failed")
        refund_credits(s, spend_id, f"Refund: AI posting copy for “{clip.title[:80]}” failed")
        raise HttpError(502, f"{describe_ai_error(e)} Your credit was refunded.") from None
    stored = {**suggestion, "createdAt": iso(utcnow())}
    clip.suggestionsJson = json.dumps(stored, ensure_ascii=False)
    s.commit()
    return json_response({"suggestion": stored})


def _slug(title: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", title.lower()))[:60] or "clip"


@router.get("/clips/{clip_id}/download")
def download(clip_id: str, request: Request, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Downloads a clip as an MP4 (?format=original|vertical). Only for direct file sources:
    YouTube and Vimeo don't permit downloading their videos."""
    clip = _own_clip(s, user, clip_id)
    v = clip.video
    if v.platform != "direct":
        raise HttpError(409, "Downloads are available for clips from direct video files. YouTube and Vimeo don't allow downloading their videos.")
    if clip.endSec - clip.startSec > MAX_DOWNLOAD_SEC:
        raise HttpError(400, "Downloads are limited to clips of 10 minutes or less.")
    rate_limit(request, f"download:{user.id}", 20, 60 * 60)
    try:
        assert_public_url(v.sourceUrl)
    except ValueError as e:
        raise HttpError(400, str(e)) from None

    vertical = request.query_params.get("format") == "vertical"
    proc = spawn_cut(v.sourceUrl, clip.startSec, clip.endSec, vertical)
    assert proc.stdout is not None and proc.stderr is not None
    stderr = bytearray()

    def drain() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            if len(stderr) < 2000:
                stderr.extend(line)

    threading.Thread(target=drain, daemon=True).start()
    timer = threading.Timer(MAX_RENDER_SECONDS - 10, proc.kill)
    timer.start()

    # Wait for the first bytes (or a failure) so errors become a clear message, not a broken file.
    first = proc.stdout.read1(65536) if hasattr(proc.stdout, "read1") else proc.stdout.read(65536)  # type: ignore[union-attr]
    if not first:
        proc.wait()
        timer.cancel()
        msg = stderr.decode(errors="replace")
        log.error("ffmpeg failed: %s", msg[:500])
        unreadable = re.search(r"404|403|Server returned|Connection refused|timed out", msg, re.I)
        return json_response(
            {"error": "The source video couldn't be read. Check the file link is still public." if unreadable else "Couldn't cut this clip. Please try again."},
            502,
        )

    def stream():
        try:
            yield first
            while chunk := proc.stdout.read1(65536):  # type: ignore[union-attr]
                yield chunk
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.kill()

    name = f"{_slug(clip.title)}{'-vertical' if vertical else ''}.mp4"
    return StreamingResponse(stream(), media_type="video/mp4", headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
