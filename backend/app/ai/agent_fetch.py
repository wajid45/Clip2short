"""Agent browser-fetch fallback.

When our servers are blocked (YouTube bot checks, rate limits), Claude's server-side
web_fetch tool retrieves the caption sources from Anthropic's infrastructure instead.
It may only fetch the URLs we list, on the video's own domains.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

from ..captions.parse import Segment, estimate_timing, normalize, parse_vtt_or_srt
from ..config import settings
from .client import FALLBACK_BETA, client


class TimedLine(BaseModel):
    start: float = Field(description="seconds")
    text: str


class AgentResult(BaseModel):
    found: bool = Field(description="true only if real transcript text was retrieved")
    format: Literal["vtt", "timed_lines", "plain", "none"]
    vtt: str = Field(description="If a WebVTT/SRT/timed caption document was fetched, its cues re-emitted as WebVTT; else empty")
    timed_lines: list[TimedLine] = Field(description="Timestamped lines if the source shows timestamps but isn't VTT; else empty")
    plain_text: str = Field(description="Transcript text without timings if that is all that was available; else empty")
    source_url: str = Field(description="The URL the transcript came from, or empty")
    note: str = Field(description="One sentence on what was found or why nothing was found")


@dataclass
class AgentFetchResult:
    segments: list[Segment]
    timing: str  # exact | estimated
    note: str


def _note(url: str, what: str) -> str:
    host = urlsplit(url).hostname if url else None
    return f"Retrieved by the AI fetch agent as {what}{f' from {host or "the source"}' if url else ''}."


def agent_fetch_captions(*, page_url: str, candidate_urls: list[str], allowed_domains: list[str], duration_sec: float | None) -> AgentFetchResult | None:
    urls = [page_url, *candidate_urls][:8]
    listing = "\n".join(f"{i + 1}. {u}" for i, u in enumerate(urls))
    prompt = f"""Retrieve the spoken-word transcript (captions/subtitles) of this video so it can be clipped.

Fetch these URLs in order until one yields caption text. Stop as soon as you have real caption text:
{listing}

Rules:
- Only report text that actually appears in a fetched document. Never write, summarise or reconstruct a transcript yourself.
- If a document is WebVTT, SRT or YouTube timed text, re-emit all of its cues as WebVTT in "vtt" (format "vtt").
- If you only find timestamped lines, use "timed_lines". If only untimed text, use "plain_text".
- If none of the URLs contain captions, return found=false and format "none"."""

    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    tools = [
        {
            "type": "web_fetch_20260209",
            "name": "web_fetch",
            "max_uses": 6,
            "allowed_domains": allowed_domains,
            "max_content_tokens": 120000,
        }
    ]

    # Server tools can pause long turns; continue up to a few times.
    for _ in range(4):
        with client().beta.messages.stream(
            model=settings.anthropic_model,
            max_tokens=64000,
            betas=[FALLBACK_BETA],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": "low"},
            output_format=AgentResult,
            tools=tools,  # type: ignore[arg-type]
            messages=messages,  # type: ignore[arg-type]
        ) as stream:
            message = stream.get_final_message()
        if message.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": message.content})
            continue
        if message.stop_reason in ("refusal", "max_tokens"):
            return None
        r = message.parsed_output
        if not r or not r.found:
            return None
        if r.format == "vtt" and "-->" in r.vtt:
            segs = parse_vtt_or_srt(r.vtt)
            if segs:
                return AgentFetchResult(segs, "exact", _note(r.source_url, "timed captions"))
        if len(r.timed_lines) >= 3:
            lines = sorted(r.timed_lines, key=lambda line: line.start)
            segs = normalize(
                [{"start": ln.start, "end": lines[i + 1].start if i + 1 < len(lines) else ln.start + 5, "text": ln.text} for i, ln in enumerate(lines)]
            )
            if segs:
                return AgentFetchResult(segs, "exact", _note(r.source_url, "timestamped lines"))
        if len(r.plain_text.split()) > 40:
            return AgentFetchResult(
                estimate_timing(r.plain_text, duration_sec),
                "estimated",
                f"{_note(r.source_url, 'untimed text')} Placement is estimated from word count, so check in/out points in the editor.",
            )
        return None
    return None
