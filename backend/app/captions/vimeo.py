"""Vimeo metadata (oEmbed + player config) and creator-uploaded text tracks."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ..video.fetcher import fetch
from .parse import parse_vtt_or_srt
from .youtube import CaptionResult


def _split_id(external_id: str) -> tuple[str, str | None]:
    vid, _, h = external_id.partition(":")
    return vid, h or None


def fetch_vimeo_oembed(url: str) -> dict[str, Any] | None:
    try:
        res = fetch(f"https://vimeo.com/api/oembed.json?url={quote(url, safe='')}")
        if not res.is_success:
            return None
        j = res.json()
        return {
            "title": j.get("title"),
            "description": j.get("description"),
            "author": j.get("author_name"),
            "durationSec": j.get("duration"),
            "thumbnailUrl": j.get("thumbnail_url"),
        }
    except Exception:
        return None


def _player_config(external_id: str) -> dict[str, Any] | None:
    vid, h = _split_id(external_id)
    try:
        res = fetch(f"https://player.vimeo.com/video/{vid}/config{f'?h={h}' if h else ''}", headers={"Referer": "https://vimeo.com/"})
        return res.json() if res.is_success else None
    except Exception:
        return None


def fetch_vimeo_meta(url: str, external_id: str) -> dict[str, Any]:
    oembed = fetch_vimeo_oembed(url) or {}
    config = _player_config(external_id) or {}
    v = config.get("video") or {}
    thumbs = v.get("thumbs") or {}
    return {
        "title": oembed.get("title") or v.get("title"),
        "description": oembed.get("description") or "",
        "author": oembed.get("author") or (v.get("owner") or {}).get("name"),
        "durationSec": oembed.get("durationSec") or v.get("duration"),
        "thumbnailUrl": oembed.get("thumbnailUrl") or thumbs.get("640") or thumbs.get("base"),
    }


def pull_vimeo_captions(external_id: str) -> tuple[CaptionResult | None, list[str]]:
    attempts: list[str] = []
    config = _player_config(external_id)
    if not config:
        return None, ["Vimeo player config: unavailable (private or embedding disabled)"]
    tracks: list[dict[str, Any]] = (config.get("request") or {}).get("text_tracks") or []
    if not tracks:
        return None, ["Vimeo: the creator hasn't uploaded any text tracks"]

    def score(t: dict[str, Any]) -> int:
        return (2 if t.get("kind") == "captions" else 0) + (1 if str(t.get("lang", "")).startswith("en") else 0)

    for t in sorted(tracks, key=score, reverse=True):
        lang = t.get("lang", "")
        try:
            url = t["url"] if str(t["url"]).startswith("http") else f"https://player.vimeo.com{t['url']}"
            res = fetch(url)
            if not res.is_success:
                attempts.append(f"Vimeo {lang} track: HTTP {res.status_code}")
                continue
            segments = parse_vtt_or_srt(res.text)
            if segments:
                note = f"Creator-uploaded Vimeo {t.get('kind') or 'text'} track ({t.get('label') or lang}). Timings are exact."
                return CaptionResult(segments, f"vimeo:texttrack:{lang}", lang, note), attempts
            attempts.append(f"Vimeo {lang} track: empty")
        except Exception:
            attempts.append(f"Vimeo {lang} track: download failed")
    return None, attempts
