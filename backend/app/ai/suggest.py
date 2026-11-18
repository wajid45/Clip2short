"""AI posting copy for one clip: improved clip fields plus ready-to-post text per network.

Suggestions are only shown to the user; nothing is applied until they approve it.
Links are never written by the model: the app appends the timestamp link itself.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from ..config import settings
from .client import FALLBACK_BETA, client


class Suggestion(BaseModel):
    title: str = Field(description="Clip working title, under 60 characters, no clickbait the clip doesn't deliver")
    hook: str = Field(description="The best opening line for the clip, taken from or faithful to the transcript, under 15 words")
    caption: str = Field(description="General social caption, 1-2 short sentences, no hashtags, no links")
    hashtags: list[str] = Field(description="4-6 relevant hashtags without the # symbol, mixing broad and specific")
    youtube_title: str = Field(description="YouTube Shorts title under 90 characters; end with #Shorts")
    youtube_description: str = Field(
        description="YouTube description: 2-4 short lines, credit the source creator if known, then 3-5 hashtags on the last line. No links."
    )
    instagram: str = Field(
        description="Instagram Reels caption: punchy first line, 1-2 more lines, a call to comment, then 5-8 hashtags on their own line. No links."
    )
    facebook: str = Field(description="Facebook post: 1-3 sentences with a question to drive comments. No hashtags, no links.")
    rationale: str = Field(description="One sentence on the angle chosen for this copy, written for the creator")


SYSTEM = """You are a short-form social media editor who writes posting copy for clips cut from long videos and live streams.

Write copy that makes people stop scrolling and watch, but never promise something the clip does not deliver. Match the tone of the speaker: hype for gaming streams, calm for interviews, playful for comedy. Write in the transcript's language.

Rules:
- Base everything on the clip transcript and the source video's context. Do not invent facts, numbers, names or events.
- Never write URLs or say "link in bio"; the app adds the link.
- No emoji spam: at most one or two, and only where the platform culture expects them (Instagram).
- Respect each field's length limit strictly.
- If the source is someone else's stream, credit them by name when the source title or description makes the name clear."""


def suggest_copy(
    *,
    video_title: str,
    video_description: str,
    author: str | None,
    clip_title: str,
    transcript: str,
    duration_sec: float,
    current_hook: str,
    current_caption: str,
) -> dict[str, Any]:
    content = f"""<source_video>
<title>{video_title}</title>
<creator>{author or "unknown"}</creator>
<description>{video_description[:1500]}</description>
</source_video>

<clip>
<working_title>{clip_title}</working_title>
<length_seconds>{round(duration_sec)}</length_seconds>
<current_hook>{current_hook}</current_hook>
<current_caption>{current_caption}</current_caption>
<transcript>{transcript[:6000] or "(no transcript available for this range)"}</transcript>
</clip>

Write the posting copy for this clip."""

    message = client().beta.messages.parse(
        model=settings.anthropic_model,
        max_tokens=16000,
        betas=[FALLBACK_BETA],
        fallbacks="default",
        output_config={"effort": "medium"},
        output_format=Suggestion,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": content}],
    )
    if message.stop_reason == "refusal":
        raise RuntimeError("The AI declined to write copy for this clip.")
    if message.stop_reason == "max_tokens":
        raise RuntimeError("The AI response was cut off. Please retry.")
    s = message.parsed_output
    if not s:
        raise RuntimeError("The AI returned an unreadable result. Please retry.")
    out = s.model_dump()
    out["hashtags"] = [t for t in (re.sub(r"\s+", "", h.lstrip("#")) for h in s.hashtags) if t][:8]
    return out
