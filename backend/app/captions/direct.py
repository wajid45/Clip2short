"""Direct file links: look for a caption file published next to the video (same name, .vtt/.srt)."""

from __future__ import annotations

import re
from urllib.parse import unquote, urlsplit

from ..video.fetcher import assert_public_url, fetch
from .parse import parse_vtt_or_srt
from .youtube import CaptionResult


def pull_sibling_captions(video_url: str) -> tuple[CaptionResult | None, list[str]]:
    base = re.sub(r"\.[a-z0-9]+$", "", re.sub(r"[?#].*$", "", video_url), flags=re.I)
    for ext in (".vtt", ".srt", ".en.vtt", ".en.srt"):
        url = base + ext
        try:
            assert_public_url(url)
            res = fetch(url, timeout=8)
            if not res.is_success:
                continue
            segments = parse_vtt_or_srt(res.text)
            if segments:
                name = url.rsplit("/", 1)[-1]
                note = f"Caption file found next to the video ({name}). Timings are exact."
                return CaptionResult(segments, f"direct:sidecar{ext}", "en" if ".en." in ext else "und", note), []
        except Exception:
            continue
    return None, ["No .vtt or .srt caption file published alongside the video"]


def title_from_file_url(url: str) -> str:
    try:
        name = unquote(urlsplit(url).path.rsplit("/", 1)[-1] or "Video")
        t = re.sub(r"\s+", " ", re.sub(r"[-_.]+", " ", re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I))).strip()
        return t[0].upper() + t[1:] if t else "Untitled video"
    except Exception:
        return "Untitled video"
