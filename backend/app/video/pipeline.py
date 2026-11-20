"""Import pipeline: metadata from the link, captions through every strategy, then AI analysis."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import delete, exists, select, update

from .. import notify
from ..ai.agent_fetch import agent_fetch_captions
from ..ai.client import ai_configured, describe_ai_error
from ..ai.clipper import analyze_transcript
from ..captions.direct import pull_sibling_captions, title_from_file_url
from ..captions.parse import Segment
from ..captions.vimeo import fetch_vimeo_meta, pull_vimeo_captions
from ..captions.youtube import YouTubePlayerData, fetch_oembed, fetch_watch_page, pull_youtube_captions
from ..credits import InsufficientCredits, credit_summary, refund_credits, spend_credits
from ..db import SessionLocal, utcnow
from ..models import Clip, Post, Video
from ..plans import analysis_cost
from .source import ParsedSource, youtube_thumb

log = logging.getLogger("shortlark.pipeline")


@dataclass
class ResolvedMeta:
    title: str
    description: str
    author: str | None
    durationSec: float | None
    thumbnailUrl: str | None
    youtube: YouTubePlayerData | None = None


def resolve_metadata(src: ParsedSource, client_duration: float | None = None) -> ResolvedMeta:
    """Reads title, length and description from the link itself."""
    if src.platform == "youtube" and src.externalId:
        try:
            watch = fetch_watch_page(src.externalId)
        except Exception:
            watch = None
        oembed = fetch_oembed(src.externalId)
        if not watch and not oembed:
            raise ValueError("We couldn't open that YouTube video. Check that it's public or unlisted.")
        if watch and watch.playabilityStatus == "ERROR":
            raise ValueError(watch.playabilityReason or "That YouTube video is unavailable.")
        return ResolvedMeta(
            title=(watch.title if watch else None) or (oembed or {}).get("title") or "YouTube video",
            description=(watch.description if watch else None) or "",
            author=(watch.author if watch else None) or (oembed or {}).get("author"),
            durationSec=(watch.lengthSeconds if watch else None) or client_duration,
            thumbnailUrl=youtube_thumb(src.externalId),
            youtube=watch,
        )
    if src.platform == "vimeo" and src.externalId:
        m = fetch_vimeo_meta(src.canonicalUrl, src.externalId)
        if not m.get("title"):
            raise ValueError("We couldn't open that Vimeo video. Private videos need their share link (with the hash).")
        return ResolvedMeta(
            title=m["title"],
            description=m.get("description") or "",
            author=m.get("author"),
            durationSec=m.get("durationSec") or client_duration,
            thumbnailUrl=m.get("thumbnailUrl"),
        )
    return ResolvedMeta(title_from_file_url(src.canonicalUrl), "", None, client_duration, None)


def get_segments(transcript_json: str | None) -> list[Segment]:
    if not transcript_json:
        return []
    try:
        return json.loads(transcript_json)
    except json.JSONDecodeError:
        return []


def pull_captions(video_id: str, youtube: YouTubePlayerData | None = None) -> bool:
    """Tries every caption strategy for the platform, then the AI fetch agent. Persists the outcome."""
    with SessionLocal() as s:
        video = s.get(Video, video_id)
        if not video:
            return False
        video.captionStatus, video.captionNote = "pending", "Fetching captions…"
        s.commit()

        attempts: list[str] = []
        result = None
        timing = "exact"
        candidate_urls: list[str] = []
        allowed: list[str] = []
        try:
            if video.platform == "youtube" and video.externalId:
                result, tried, player = pull_youtube_captions(video.externalId, youtube)
                attempts += tried
                if not video.durationSec and player and player.lengthSeconds:
                    video.durationSec = player.lengthSeconds
                    s.commit()
                candidate_urls += [f"{t.baseUrl}&fmt=vtt" for t in (player.tracks if player else [])]
                candidate_urls.append(f"https://www.youtube.com/api/timedtext?v={video.externalId}&lang=en&fmt=vtt")
                allowed = ["youtube.com", "www.youtube.com", "youtu.be"]
            elif video.platform == "vimeo" and video.externalId:
                result, tried = pull_vimeo_captions(video.externalId)
                attempts += tried
                vid, _, h = video.externalId.partition(":")
                candidate_urls.append(f"https://player.vimeo.com/video/{vid}/config{f'?h={h}' if h else ''}")
                allowed = ["vimeo.com", "player.vimeo.com", "vimeocdn.com"]
            else:
                result, tried = pull_sibling_captions(video.sourceUrl)
                attempts += tried
                allowed = [urlsplit(video.sourceUrl).hostname or ""]

            segments = result.segments if result else None
            source = result.source if result else None
            language = result.language if result else None
            note = result.note if result else ""

            # Agent browser-fetch fallback (YouTube/Vimeo only; it runs on Anthropic's infrastructure).
            if not segments and ai_configured() and video.platform != "direct":
                try:
                    r = agent_fetch_captions(page_url=video.sourceUrl, candidate_urls=candidate_urls, allowed_domains=allowed, duration_sec=video.durationSec)
                    if r:
                        segments, timing, source, note = r.segments, r.timing, "agent:fetch", r.note
                    else:
                        attempts.append("AI fetch agent: no captions found")
                except Exception as e:
                    attempts.append(f"AI fetch agent: {describe_ai_error(e)}")
        except Exception as e:
            segments = None
            attempts.append(f"Unexpected error: {e}")

        if segments:
            video.captionStatus = "ready"
            video.captionSource = source
            video.captionTiming = timing
            video.captionLanguage = language
            video.captionNote = note
            video.transcriptJson = json.dumps(segments, ensure_ascii=False)
            s.commit()
            return True
        video.captionStatus = "missing"
        video.captionSource = None
        video.captionTiming = None
        video.captionNote = f"We couldn't get captions automatically. Paste a transcript to continue. Tried: {'; '.join(attempts) or 'all sources'}."
        s.commit()
        return False


def _fail(s, video: Video, message: str) -> None:
    video.analysisStatus = "failed"
    video.analysisError = message
    s.commit()


def run_analysis(video_id: str, focus: str = "auto") -> None:  # category comes from the video
    """Runs the AI clipper. Keeps clips the user has touched; replaces untouched AI ideas."""
    with SessionLocal() as s:
        video = s.get(Video, video_id)
        if not video:
            return
        segments = get_segments(video.transcriptJson)
        if not segments:
            return _fail(s, video, "Captions are needed before AI can find moments.")
        if not ai_configured():
            return _fail(s, video, "AI analysis isn't configured on this server (missing GEMINI_API_KEY).")

        # Charge credits before the AI call; refund automatically if analysis fails.
        duration = video.durationSec or float(segments[-1]["end"]) or 60
        rerun = video.analysisCount > 0
        cost = analysis_cost(duration, rerun)
        balance_before = credit_summary(s, video.userId).total
        try:
            spend_id = spend_credits(
                s,
                video.userId,
                cost,
                f"{'Re-ran moments on' if rerun else 'Found moments in'} “{video.title[:80]}” ({round(duration / 60)} min)",
                video.id,
            )
        except InsufficientCredits as e:
            return _fail(s, video, f"Not enough credits: finding moments here needs {e.needed} and you have {e.available}. Buy credits or upgrade in Billing.")
        except Exception as e:
            return _fail(s, video, str(e))

        video.analysisStatus, video.analysisError = "running", None
        s.commit()
        try:
            summary, clips = analyze_transcript(
                title=video.title,
                description=video.description,
                duration_sec=video.durationSec,
                segments=segments,
                timing=video.captionTiming or "exact",
                focus=focus,
                category=video.category,
            )
            s.execute(
                delete(Clip).where(
                    Clip.videoId == video_id,
                    Clip.origin == "ai",
                    Clip.status == "idea",
                    ~exists(select(Post.id).where(Post.clipId == Clip.id)),
                )
            )
            for c in clips:
                s.add(
                    Clip(
                        userId=video.userId,
                        videoId=video_id,
                        origin="ai",
                        status="idea",
                        title=c.title,
                        startSec=c.startSec,
                        endSec=c.endSec,
                        hook=c.hook,
                        caption=c.caption,
                        hashtags=c.hashtags,
                        category=c.category,
                        momentLabel=c.moment or None,
                        score=c.score,
                        scoreHook=c.scoreHook,
                        scoreSelf=c.scoreSelf,
                        scorePayoff=c.scorePayoff,
                        scoreQuote=c.scoreQuote,
                        reason=c.reason,
                        transcript=c.transcript,
                    )
                )
            s.execute(
                update(Video)
                .where(Video.id == video_id)
                .values(
                    analysisStatus="done",
                    analysisCount=Video.analysisCount + 1,
                    analyzedAt=utcnow(),
                    summary=summary,
                    analysisError=None if clips else "The AI didn't find any moments strong enough to clip.",
                )
            )
            s.commit()
            # Account emails (never fail the analysis).
            notify.clips_ready(video.userId, video_id, video.title, len(clips), max((c.score for c in clips), default=None))
            balance_after = credit_summary(s, video.userId).total
            if notify.crossed_low(balance_before, balance_after):
                notify.low_credits(video.userId, balance_after)
        except Exception as e:
            s.rollback()
            log.exception("analysis failed")
            refund_credits(s, spend_id, f"Refund: analysis of “{video.title[:80]}” failed")
            video = s.get(Video, video_id)
            if video:
                _fail(s, video, f"{describe_ai_error(e)} Your {cost} credits were refunded.")


def process_video(video_id: str, youtube: YouTubePlayerData | None = None) -> None:
    """Full import pipeline, run after the import request responds."""
    if not pull_captions(video_id, youtube):
        return
    with SessionLocal() as s:
        focus = s.scalar(select(Video.analysisFocus).where(Video.id == video_id)) or "auto"
    run_analysis(video_id, focus)


def meta_to_dict(meta: ResolvedMeta) -> dict[str, Any]:
    return {"title": meta.title, "durationSec": meta.durationSec}
