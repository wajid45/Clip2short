"""Video import, progress polling, captions (refetch or paste) and AI analysis."""

import json
import logging
from typing import Literal

from fastapi import Depends, Request
from pydantic import Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..ai.client import ai_configured
from ..ai.clipper import FOCUSES
from ..auth import require_subscriber, require_user
from ..background import after
from ..captions.parse import parse_pasted_transcript
from ..credits import credit_summary
from ..db import get_db
from ..http import HttpError, json_response, validate
from ..models import Clip, User, Video
from ..plans import analysis_cost, has_active_subscription, limits_for
from ..ratelimit import rate_limit
from ..video.fetcher import assert_public_url
from ..video.pipeline import get_segments, process_video, resolve_metadata, run_analysis
from ..video.source import SourceError, parse_video_url
from .common import JsonBody, Model, api_router, not_found, text

log = logging.getLogger("shortlark.videos")
router = api_router()


class ImportBody(Model):
    url: text(1, min_msg="Paste a video link")  # type: ignore[valid-type]
    # Duration measured by the browser for direct files (servers can't read it without downloading).
    clientDuration: float | None = Field(default=None, gt=0, le=24 * 3600)
    focus: Literal["auto", "events", "funny", "insights"] | None = None


@router.post("/videos")
def import_video(request: Request, body: JsonBody, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    b = validate(ImportBody, body)
    try:
        parsed = parse_video_url(b.url)
    except SourceError as e:
        raise HttpError(400, str(e)) from None
    if parsed.platform == "direct":
        try:
            assert_public_url(parsed.canonicalUrl)
        except ValueError as e:
            raise HttpError(400, str(e)) from None
    rate_limit(request, f"import:{user.id}", 30, 60 * 60)

    try:
        meta = resolve_metadata(parsed, b.clientDuration)
    except ValueError as e:
        raise HttpError(422, str(e)) from None

    limits = limits_for(user)
    if meta.durationSec and meta.durationSec > limits["maxVideoMinutes"] * 60:
        who = "Your plan" if has_active_subscription(user) else "Without a plan, Shortlark"
        raise HttpError(
            402,
            f"This video is {round(meta.durationSec / 60)} minutes long. {who} handles videos up to {limits['maxVideoMinutes']} minutes.",
            "limit_reached",
        )
    # Credits are charged when the AI analyses the video; check up front so nobody imports what they can't afford.
    balance = credit_summary(s, user.id).total
    cost = analysis_cost(meta.durationSec, False) if meta.durationSec else 1
    if balance < cost:
        raise HttpError(
            402,
            f"Finding moments in this {round((meta.durationSec or 60) / 60)}-minute video needs {cost} credits and you have {balance}. Buy credits or upgrade in Billing.",
            "no_credits",
        )

    video = Video(
        userId=user.id,
        sourceUrl=parsed.canonicalUrl,
        platform=parsed.platform,
        externalId=parsed.externalId,
        title=meta.title[:300],
        description=meta.description[:10000],
        author=meta.author,
        durationSec=meta.durationSec,
        thumbnailUrl=meta.thumbnailUrl,
        captionStatus="pending",
        captionNote="Fetching captions…",
        analysisStatus="idle",
        analysisFocus=b.focus or "auto",
    )
    s.add(video)
    s.commit()
    # Captions + AI analysis continue after the response; the page polls for progress.
    after(process_video, video.id, meta.youtube)
    return json_response({"id": video.id}, 201)


def _own_video(s: Session, user: User, video_id: str) -> Video:
    v = s.scalar(select(Video).where(Video.id == video_id, Video.userId == user.id))
    if not v:
        raise not_found("Video")
    return v


@router.get("/videos/{video_id}")
def video_progress(video_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """Polling endpoint for import/analysis progress."""
    v = _own_video(s, user, video_id)
    clip_count = s.scalar(select(func.count()).select_from(Clip).where(Clip.videoId == video_id)) or 0
    return json_response(
        {
            "id": v.id,
            "title": v.title,
            "durationSec": v.durationSec,
            "captionStatus": v.captionStatus,
            "captionNote": v.captionNote,
            "captionTiming": v.captionTiming,
            "analysisStatus": v.analysisStatus,
            "analysisError": v.analysisError,
            "clipCount": clip_count,
        }
    )


class DurationBody(Model):
    durationSec: float = Field(gt=0, le=24 * 3600)


@router.patch("/videos/{video_id}")
def report_duration(video_id: str, body: JsonBody, user: User = Depends(require_user), s: Session = Depends(get_db)):
    """The in-app player reports the true duration once metadata loads (used for direct files)."""
    v = _own_video(s, user, video_id)
    d = validate(DurationBody, body).durationSec
    if not v.durationSec or abs(v.durationSec - d) > 2:
        v.durationSec = d
        s.commit()
    return json_response({"ok": True})


@router.delete("/videos/{video_id}")
def delete_video(video_id: str, user: User = Depends(require_user), s: Session = Depends(get_db)):
    s.delete(_own_video(s, user, video_id))
    s.commit()
    return json_response({"ok": True})


@router.post("/videos/{video_id}/analyze")
def analyze(video_id: str, body: JsonBody = None, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    focus = body.get("focus") if isinstance(body, dict) and body.get("focus") in FOCUSES else "auto"
    video = _own_video(s, user, video_id)
    if not ai_configured():
        raise HttpError(503, "AI analysis isn't configured on this server.")
    if video.captionStatus != "ready":
        raise HttpError(409, "Add captions first: refetch them or paste a transcript.")
    segments = get_segments(video.transcriptJson)
    cost = analysis_cost(video.durationSec or (float(segments[-1]["end"]) if segments else 60), video.analysisCount > 0)
    balance = credit_summary(s, user.id).total
    if balance < cost:
        raise HttpError(402, f"This needs {cost} credits and you have {balance}. Buy credits or upgrade in Billing.", "no_credits")
    # Atomic claim so double clicks don't start two analyses.
    claimed = s.execute(
        update(Video).where(Video.id == video_id, Video.analysisStatus != "running").values(analysisStatus="running", analysisError=None, analysisFocus=focus)
    ).rowcount
    s.commit()
    if not claimed:
        raise HttpError(409, "Analysis is already running.")
    after(run_analysis, video_id, focus)
    return json_response({"ok": True})


class CaptionsBody(Model):
    action: Literal["refetch", "paste"]
    transcript: str | None = None
    analyze: bool | None = None


@router.post("/videos/{video_id}/captions")
def captions(video_id: str, body: JsonBody, user: User = Depends(require_subscriber), s: Session = Depends(get_db)):
    video = _own_video(s, user, video_id)
    b = validate(CaptionsBody, body)

    if b.action == "refetch":
        video.captionStatus, video.captionNote = "pending", "Fetching captions…"
        s.commit()
        after(process_video, video_id, None)
        return json_response({"ok": True})

    transcript = (b.transcript or "").strip()
    if len(transcript) < 50:
        raise HttpError(400, "transcript: Paste at least a few sentences of transcript")
    if len(transcript) > 1_500_000:
        raise HttpError(400, "transcript: Too big: expected string to have <=1500000 characters")
    segments, timed = parse_pasted_transcript(transcript, video.durationSec)
    if len(segments) < 3:
        raise HttpError(400, "We couldn't read enough text from that transcript.")
    if timed and video.durationSec and float(segments[-1]["start"]) > video.durationSec + 5:
        raise HttpError(400, "Those timestamps run past the end of the video. Is this the right transcript?")

    video.captionStatus = "ready"
    video.captionSource = "paste:timed" if timed else "paste:plain"
    video.captionTiming = "exact" if timed else "estimated"
    video.captionLanguage = None
    video.captionNote = (
        "Pasted transcript with timestamps. Clip timings follow your timestamps."
        if timed
        else "Pasted transcript without timestamps. Placement is estimated from word count, so check in/out points in the editor."
    )
    video.transcriptJson = json.dumps(segments, ensure_ascii=False)
    if b.analyze is not False:
        video.analysisStatus, video.analysisError = "running", None
    s.commit()
    if b.analyze is not False:
        after(run_analysis, video_id, video.analysisFocus)
    return json_response({"ok": True, "segments": len(segments), "timed": timed})
