"""Link parsing (mirrors shared/src/video-source.ts, which the web app uses for instant validation)."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


@dataclass
class ParsedSource:
    platform: str  # youtube | vimeo | direct
    externalId: str | None
    canonicalUrl: str


class SourceError(ValueError):
    pass


def parse_video_url(raw: str) -> ParsedSource:
    try:
        url = urlsplit(raw.strip())
    except ValueError:
        raise SourceError("That doesn't look like a link. Paste a full URL starting with https://") from None
    if not url.scheme or not url.netloc:
        raise SourceError("That doesn't look like a link. Paste a full URL starting with https://")
    if url.scheme not in ("http", "https"):
        raise SourceError("Only http(s) links are supported.")
    host = (url.hostname or "").lower()
    query = parse_qs(url.query)

    if host in YT_HOSTS:
        vid: str | None = None
        if host.endswith("youtu.be"):
            vid = url.path[1:].split("/")[0] or None
        elif url.path == "/watch":
            vid = (query.get("v") or [None])[0]
        else:
            m = re.match(r"^/(?:shorts|live|embed|v)/([^/?#]+)", url.path)
            if m:
                vid = m.group(1)
        if not vid or not YT_ID.match(vid):
            raise SourceError("We couldn't find a video ID in that YouTube link.")
        return ParsedSource("youtube", vid, f"https://www.youtube.com/watch?v={vid}")

    if host in ("vimeo.com", "www.vimeo.com", "player.vimeo.com"):
        m = re.search(r"/(?:video/)?(\d{5,})(?:/([a-f0-9]{6,}))?", url.path)
        if not m:
            raise SourceError("We couldn't find a video ID in that Vimeo link.")
        h = m.group(2) or (query.get("h") or [None])[0]
        canonical = f"https://vimeo.com/{m.group(1)}{f'/{h}' if h else ''}"
        return ParsedSource("vimeo", f"{m.group(1)}:{h}" if h else m.group(1), canonical)

    if re.search(r"\.(mp4|webm|m4v|mov)$", url.path, re.I):
        if is_private_host(host):
            raise SourceError("Links to private or local network addresses aren't allowed.")
        return ParsedSource("direct", None, raw.strip())

    raise SourceError("Paste a YouTube or Vimeo link, or a direct link to an .mp4 or .webm file.")


def is_private_host(host: str) -> bool:
    """Blocks obvious SSRF targets. The fetcher additionally resolves DNS before fetching."""
    h = host.strip("[]").lower()
    if h == "localhost" or h.endswith((".localhost", ".internal", ".local")):
        return True
    if re.match(r"^(127|10|0)\.", h) or h.startswith("192.168.") or h.startswith("169.254."):
        return True
    if re.match(r"^172\.(1[6-9]|2\d|3[01])\.", h):
        return True
    return h == "::1" or h.startswith(("fc", "fd", "fe80"))


def youtube_thumb(video_id: str) -> str:
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def timestamp_url(platform: str, source_url: str, external_id: str | None, start_sec: float) -> str:
    """Deep link that opens the source video at a timestamp."""
    t = max(0, math.floor(start_sec))
    if platform == "youtube" and external_id:
        return f"https://youtu.be/{external_id}?t={t}"
    if platform == "vimeo":
        h, m, s = t // 3600, (t % 3600) // 60, t % 60
        return f"{source_url}#t={f'{h}h' if h else ''}{f'{m}m' if m else ''}{s}s"
    return f"{source_url}#t={t}"
