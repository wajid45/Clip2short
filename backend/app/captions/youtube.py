"""YouTube metadata and captions, tried through every server-side strategy."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from ..video.fetcher import fetch
from .parse import Segment, parse_json3, parse_timed_text_xml, parse_vtt_or_srt


@dataclass
class CaptionTrack:
    baseUrl: str
    languageCode: str
    kind: str | None = None  # "asr" for auto-generated
    name: str | None = None
    isTranslatable: bool | None = None


@dataclass
class YouTubePlayerData:
    tracks: list[CaptionTrack] = field(default_factory=list)
    title: str | None = None
    description: str | None = None
    author: str | None = None
    lengthSeconds: float | None = None
    defaultAudioLanguage: str | None = None
    playabilityStatus: str | None = None
    playabilityReason: str | None = None


@dataclass
class CaptionResult:
    segments: list[Segment]
    source: str  # e.g. youtube:manual:en
    language: str
    note: str


def extract_json_after(page: str, marker: str) -> Any | None:
    """Extracts a JSON object assigned to `marker` in a page script, using brace matching."""
    idx = page.find(marker)
    if idx < 0:
        return None
    start = page.find("{", idx + len(marker))
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(page)):
        c = page[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(page[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _from_player_response(pr: dict[str, Any]) -> YouTubePlayerData:
    vd = pr.get("videoDetails") or {}
    mf = (pr.get("microformat") or {}).get("playerMicroformatRenderer") or {}
    tl = (pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
    tracks: list[CaptionTrack] = []
    for t in tl.get("captionTracks") or []:
        name = t.get("name") or {}
        tracks.append(
            CaptionTrack(
                baseUrl=t.get("baseUrl") or "",
                languageCode=t.get("languageCode") or "",
                kind=t.get("kind"),
                name=name.get("simpleText") or "".join(r.get("text", "") for r in name.get("runs") or []) or None,
                isTranslatable=t.get("isTranslatable"),
            )
        )
    audio = tl.get("audioTracks") or []
    audio_idx = None
    if audio:
        default = audio[tl.get("defaultAudioTrackIndex") or 0] if len(audio) > (tl.get("defaultAudioTrackIndex") or 0) else {}
        audio_idx = default.get("defaultCaptionTrackIndex")
    length = vd.get("lengthSeconds") or mf.get("lengthSeconds")
    ps = pr.get("playabilityStatus") or {}
    return YouTubePlayerData(
        title=vd.get("title") or (mf.get("title") or {}).get("simpleText"),
        description=vd.get("shortDescription") or (mf.get("description") or {}).get("simpleText"),
        author=vd.get("author") or mf.get("ownerChannelName"),
        lengthSeconds=float(length) if length else None,
        tracks=[t for t in tracks if t.baseUrl],
        defaultAudioLanguage=tracks[audio_idx].languageCode if isinstance(audio_idx, int) and audio_idx < len(tracks) else None,
        playabilityStatus=ps.get("status"),
        playabilityReason=ps.get("reason"),
    )


def fetch_watch_page(video_id: str) -> YouTubePlayerData | None:
    """Strategy 1: the public watch page. Also yields title, description and length."""
    res = fetch(
        f"https://www.youtube.com/watch?v={video_id}&hl=en&has_verified=1&bpctr=9999999999",
        headers={"Cookie": "CONSENT=YES+cb; SOCS=CAI"},
    )
    if not res.is_success:
        return None
    pr = extract_json_after(res.text, "ytInitialPlayerResponse = ") or extract_json_after(res.text, 'ytInitialPlayerResponse":')
    return _from_player_response(pr) if pr else None


_INNERTUBE_CLIENTS: list[dict[str, Any]] = [
    {"clientName": "ANDROID", "clientVersion": "19.44.38", "androidSdkVersion": 34, "ua": "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip"},
    {
        "clientName": "IOS",
        "clientVersion": "19.45.4",
        "deviceModel": "iPhone16,2",
        "ua": "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X)",
    },
    {"clientName": "WEB", "clientVersion": "2.20241120.01.00"},
    {"clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "clientVersion": "2.0"},
]


def fetch_innertube(video_id: str) -> list[YouTubePlayerData]:
    """Strategy 2: the InnerTube player API with several client identities."""
    out: list[YouTubePlayerData] = []
    for c in _INNERTUBE_CLIENTS:
        client = {k: v for k, v in c.items() if k != "ua"}
        try:
            res = fetch(
                "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
                method="POST",
                headers={"Content-Type": "application/json", **({"User-Agent": c["ua"]} if "ua" in c else {})},
                json={
                    "videoId": video_id,
                    "context": {"client": {**client, "hl": "en", "gl": "US"}, "thirdParty": {"embedUrl": "https://www.youtube.com"}},
                    "contentCheckOk": True,
                    "racyCheckOk": True,
                },
                timeout=12,
            )
            if not res.is_success:
                continue
            data = _from_player_response(res.json())
            out.append(data)
            if data.tracks:
                break
        except Exception:
            continue
    return out


def fetch_oembed(video_id: str) -> dict[str, str | None] | None:
    """oEmbed is the most reliable source for a title when the watch page is blocked."""
    try:
        res = fetch(f"https://www.youtube.com/oembed?format=json&url={quote(f'https://www.youtube.com/watch?v={video_id}', safe='')}")
        if not res.is_success:
            return None
        j = res.json()
        return {"title": j.get("title"), "author": j.get("author_name")}
    except Exception:
        return None


def rank_tracks(tracks: list[CaptionTrack], spoken: str | None) -> list[CaptionTrack]:
    """Manual in the spoken language, then auto-generated, then other manual tracks, English first."""
    sp = spoken.split("-")[0] if spoken else None

    def score(t: CaptionTrack) -> int:
        lang = t.languageCode.split("-")[0]
        s = 0
        if t.kind != "asr":
            s += 10
        if sp and lang == sp:
            s += 20
        if t.kind == "asr":
            s += 15  # the auto track is almost always in the spoken language
        if lang == "en":
            s += 3
        return s

    return sorted(tracks, key=score, reverse=True)


def _with_param(url: str, key: str, value: str) -> str:
    if not url.startswith("http"):
        url = f"https://www.youtube.com{url}"
    parts = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != key] + [(key, value)]
    return urlunsplit(parts._replace(query=urlencode(q)))


def download_track(base_url: str) -> tuple[list[Segment], str] | None:
    """Tries json3, then srv3 XML, then VTT for one track URL."""
    for fmt, parser in (("json3", parse_json3), ("srv3", parse_timed_text_xml), ("vtt", parse_vtt_or_srt), ("", parse_timed_text_xml)):
        try:
            res = fetch(_with_param(base_url, "fmt", fmt) if fmt else base_url, timeout=15)
            if not res.is_success or not res.text.strip():  # 200 + empty body = YouTube wants a PO token
                continue
            segments = parser(res.text)
            if segments:
                return segments, fmt or "xml"
        except Exception:
            continue
    return None


def pull_youtube_captions(video_id: str, pre: YouTubePlayerData | None = None) -> tuple[CaptionResult | None, list[str], YouTubePlayerData | None]:
    """Watch-page tracks → InnerTube tracks (several clients) → each in json3/srv3/vtt → translation fallback."""
    attempts: list[str] = []
    watch = pre
    if watch is None:
        try:
            watch = fetch_watch_page(video_id)
        except Exception:
            watch = None
    sources: list[tuple[str, YouTubePlayerData]] = []
    if watch:
        sources.append(("watch page", watch))
    else:
        attempts.append("Watch page: unavailable")

    def try_tracks(label: str, data: YouTubePlayerData) -> CaptionResult | None:
        if not data.tracks:
            reason = f" ({data.playabilityReason})" if data.playabilityReason else ""
            attempts.append(f"{label}: no caption tracks listed{reason}")
            return None
        ranked = rank_tracks(data.tracks, data.defaultAudioLanguage)
        for t in ranked[:4]:
            kind = "asr" if t.kind == "asr" else "manual"
            dl = download_track(t.baseUrl)
            if dl:
                who = "YouTube auto-generated" if kind == "asr" else "Creator-uploaded"
                return CaptionResult(
                    dl[0],
                    f"youtube:{kind}:{t.languageCode}",
                    t.languageCode,
                    f"{who} captions ({t.name or t.languageCode}), fetched from the {label} as {dl[1]}. Timings are exact.",
                )
            attempts.append(f"{label}: {kind} {t.languageCode} track returned no text")
        # YouTube sometimes serves translated tracks when originals are gated.
        translatable = next((t for t in ranked if t.isTranslatable), None)
        if translatable:
            dl = download_track(_with_param(translatable.baseUrl, "tlang", "en"))
            if dl:
                return CaptionResult(
                    dl[0],
                    "youtube:translated:en",
                    "en",
                    f"Original captions were unavailable, so we used YouTube's English translation of the {translatable.languageCode} track. Timings are exact; wording is machine-translated.",
                )
            attempts.append(f"{label}: translation fallback returned no text")
        return None

    for label, data in sources:
        r = try_tracks(label, data)
        if r:
            return r, attempts, watch
    inner = fetch_innertube(video_id)
    if not inner:
        attempts.append("InnerTube API: no response")
    for d in inner:
        r = try_tracks("InnerTube API", d)
        if r:
            return r, attempts, watch or d
    return None, attempts, watch or (inner[0] if inner else None)
