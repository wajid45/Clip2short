"""Clip library filters and ordering, shared by the library page and exports."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from .models import Clip, Video
from .odm import ColumnElement, or_, select

CLIP_STATUSES = ("idea", "draft", "ready", "published")


@dataclass
class ClipFilters:
    q: str | None = None
    status: str | None = None
    source: str | None = None  # youtube | vimeo | direct
    category: str | None = None
    min_score: float | None = None
    video_id: str | None = None
    sort: str | None = None  # score | newest | oldest | title | start


def filters_from_params(params: Mapping[str, str]) -> ClipFilters:
    def get(k: str) -> str | None:
        v = params.get(k)
        return v or None

    try:
        min_score = float(params.get("minScore") or 0)
    except ValueError:
        min_score = 0
    q = (params.get("q") or "").strip()
    return ClipFilters(
        q=q or None,
        status=get("status"),
        source=get("source"),
        category=get("category"),
        min_score=min_score if min_score > 0 else None,
        video_id=get("videoId"),
        sort=get("sort"),
    )


def clip_where(user_id: str, f: ClipFilters) -> list[ColumnElement[bool]]:
    where: list[ColumnElement[bool]] = [Clip.userId == user_id]
    if f.status and f.status in CLIP_STATUSES:
        where.append(Clip.status == f.status)
    if f.category:
        where.append(Clip.category == f.category)
    if f.min_score:
        where.append(Clip.score >= f.min_score)
    if f.video_id:
        where.append(Clip.videoId == f.video_id)
    if f.source:
        where.append(Clip.videoId.in_(select(Video.id).where(Video.platform == f.source)))
    if f.q:
        # Case-sensitive like the previous backend on SQLite; on Postgres use ilike for case-insensitive search.
        where.append(
            or_(
                Clip.title.contains(f.q),
                Clip.hook.contains(f.q),
                Clip.caption.contains(f.q),
                Clip.notes.contains(f.q),
                Clip.transcript.contains(f.q),
                Clip.videoId.in_(select(Video.id).where(Video.title.contains(f.q))),
            )
        )
    return where


def clip_order(sort: str | None):
    match sort:
        case "newest":
            return [Clip.createdAt.desc()]
        case "oldest":
            return [Clip.createdAt.asc()]
        case "title":
            return [Clip.title.asc()]
        case "start":
            return [Clip.videoId.asc(), Clip.startSec.asc()]
        case _:
            return [Clip.score.is_(None), Clip.score.desc(), Clip.createdAt.desc()]
