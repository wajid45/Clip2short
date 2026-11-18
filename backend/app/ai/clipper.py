"""The AI auto-clipper.

Design choices (informed by open-source auto-clippers):
- The model returns segment *indices*, never seconds; timestamps come from the measured
  caption timings, so the model can't drift or invent times.
- It scores against an explicit rubric with bands and may return fewer clips rather than pad.
- It returns the verbatim opening words (the hook) so we can check the start.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from ..captions.parse import Segment, transcript_text
from ..config import settings
from .client import FALLBACK_BETA, client

CATEGORIES = ("insight", "story", "humor", "hot-take", "how-to", "emotional", "data", "quote", "event")
Category = Literal["insight", "story", "humor", "hot-take", "how-to", "emotional", "data", "quote", "event"]

# What the AI should prioritise when finding moments.
FOCUSES = {"auto": "Best moments", "events": "Main events", "funny": "Funniest moments", "insights": "Insights and advice"}

FOCUS_GUIDE = {
    "auto": "Pick the strongest moments of any kind: key events, peak reactions, stories, insights and jokes.",
    "events": (
        "Prioritise the MAIN EVENTS: turning points, big plays, wins and fails, reveals, announcements and peak reactions "
        "(shouting, laughter, stunned silence, chat going wild). In gaming and live streams the transcript shows events "
        'through the streamer\'s reactions and narration ("no way", "let\'s go", "he\'s right behind me", sudden swearing, '
        "laughter cues): treat those as event markers. Start each clip just before the event builds and end it after the "
        'reaction lands. Use category "event" for these.'
    ),
    "funny": "Prioritise the funniest moments: jokes that land, banter, fails, absurd situations and genuine laughter. The punchline must be inside the clip.",
    "insights": "Prioritise insights and advice: clear lessons, counter-intuitive claims backed by a reason, concrete numbers and step-by-step how-tos.",
}


class AiClip(BaseModel):
    start_segment: int = Field(description="Index of the first transcript segment of the clip")
    end_segment: int = Field(description="Index of the last transcript segment of the clip (inclusive)")
    title: str = Field(description="Editor-style working title, under 60 characters")
    hook: str = Field(description="The verbatim opening words a viewer hears, up to ~15 words")
    caption: str = Field(description="Ready-to-post social caption, 1-3 short sentences, no hashtags")
    hashtags: list[str] = Field(description="3-5 relevant hashtags without the # symbol")
    category: Category
    score_hook: int = Field(description="0-100: does the first 3 seconds stop the scroll?")
    score_self_contained: int = Field(description="0-100: understandable with zero context?")
    score_payoff: int = Field(description="0-100: clear takeaway, punchline or resolution?")
    score_quotability: int = Field(description="0-100: a line people would repeat or share?")
    score: int = Field(description="Overall 0-100 virality score")
    reason: str = Field(description="One or two sentences on why this moment was picked, written for the creator")


class AnalysisResult(BaseModel):
    summary: str = Field(description="Two-sentence summary of the whole video")
    clips: list[AiClip]


SYSTEM = """You are a senior short-form video editor. You find the moments in long videos that will perform as standalone clips on YouTube Shorts, Instagram Reels and Facebook.

You are given a timestamped transcript split into numbered segments. Choose clips by segment index.

Judge each candidate on four criteria, in priority order:
1. Hook (score_hook): the first ~3 seconds must stop the scroll. A bold claim, a surprising number, a question, conflict, or an emotionally charged line. Openers like "so", "um", "anyway" or "as I said" score low; start the clip on the strongest line instead.
2. Self-containment (score_self_contained): a stranger must follow it with no setup. Unresolved pronouns ("he", "that thing"), references to earlier parts, or missing context lower the score.
3. Payoff (score_payoff): the viewer leaves with something: an insight, a punchline, a resolution, a useful step. No payoff means below 50.
4. Quotability (score_quotability): at least one line that people would repeat, stitch or comment on.

Overall score bands — be harsh, most moments are not clips:
- 85-100: would likely outperform the creator's average; strong on all four criteria.
- 70-84: solid, publishable with a good caption.
- 50-69: usable filler.
- below 50: do not return it.

Rules:
- Clips should run 15-90 seconds (ideal 25-60). Never exceed 120 seconds.
- Start on a complete sentence and end after the payoff lands, on a complete sentence.
- Clips must not overlap each other.
- Return fewer clips rather than padding the list with weak ones. Returning none is acceptable.
- "hook" must be the actual opening words from the transcript, not a rewrite.
- "caption" is social copy in the transcript's language, written to make people watch; no hashtags, no emojis unless the speaker's tone calls for it, never clickbait that the clip doesn't deliver.
- "reason" speaks to the creator in plain language ("Opens with a counter-intuitive claim and pays it off with a concrete number").
- If the transcript timing is marked as estimated, still choose by content; timings will be refined by the creator.
- Live streams and gameplay: much of what happens on screen is only visible through the streamer's reactions and narration. Sudden exclamations, laughter, shouting, swearing, "chat" call-outs and abrupt topic changes usually mark an event; build clips around them.
- Follow the <focus> instruction in the request when choosing between candidates."""


@dataclass
class FinalClip:
    title: str
    startSec: float
    endSec: float
    hook: str
    caption: str
    hashtags: str
    category: str
    score: int
    scoreHook: int
    scoreSelf: int
    scorePayoff: int
    scoreQuote: int
    reason: str
    transcript: str


def _clamp(n: float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, round(n)))


def target_clip_count(duration_sec: float | None, segment_count: int) -> int:
    minutes = duration_sec / 60 if duration_sec else segment_count / 12
    return max(3, min(20, round(minutes / 4)))


def finalize_clips(raw: list[AiClip], segments: list[Segment]) -> list[FinalClip]:
    """Converts model output (segment indices) to validated, de-overlapped clips with real timestamps."""
    n = len(segments)
    candidates: list[FinalClip] = []
    for c in raw:
        s = max(0, min(n - 1, c.start_segment))
        e = max(0, min(n - 1, c.end_segment))
        if e < s:
            s, e = e, s
        start = float(segments[s]["start"])
        end = float(segments[e]["end"])
        # Extend very short picks to the minimum length, trim runaway picks.
        while end - start < 12 and e < n - 1:
            e += 1
            end = float(segments[e]["end"])
        while end - start > 120 and e > s:
            e -= 1
            end = float(segments[e]["end"])
        if end - start < 5:
            continue
        start = max(0.0, start - 0.15)  # small lead-in so the first word isn't clipped
        score = _clamp(c.score)
        if score < 50:
            continue
        tags = [re.sub(r"\s+", "", h.lstrip("#")) for h in c.hashtags]
        candidates.append(
            FinalClip(
                title=c.title.strip()[:90] or "Untitled moment",
                startSec=round(start * 10) / 10,
                endSec=round(end * 10) / 10,
                hook=c.hook.strip(),
                caption=c.caption.strip(),
                hashtags=" ".join([t for t in tags if t][:6]),
                category=c.category,
                score=score,
                scoreHook=_clamp(c.score_hook),
                scoreSelf=_clamp(c.score_self_contained),
                scorePayoff=_clamp(c.score_payoff),
                scoreQuote=_clamp(c.score_quotability),
                reason=c.reason.strip(),
                transcript=transcript_text(segments, start, end),
            )
        )
    # Remove overlaps, keeping the higher-scoring clip.
    candidates.sort(key=lambda c: c.score, reverse=True)
    kept: list[FinalClip] = []
    for c in candidates:
        overlaps = any(min(k.endSec, c.endSec) - max(k.startSec, c.startSec) > 0.3 * min(k.endSec - k.startSec, c.endSec - c.startSec) for k in kept)
        if not overlaps:
            kept.append(c)
    return kept


def analyze_transcript(
    *, title: str, description: str, duration_sec: float | None, segments: list[Segment], timing: str, focus: str = "auto"
) -> tuple[str, list[FinalClip]]:
    if len(segments) < 3:
        raise ValueError("The transcript is too short to find clips.")
    target = target_clip_count(duration_sec, len(segments))
    transcript = "\n".join(f"[{i}] {float(s['start']):.1f}s {s['text']}" for i, s in enumerate(segments))
    user_content = f"""<video>
<title>{title}</title>
<duration_seconds>{duration_sec if duration_sec is not None else "unknown"}</duration_seconds>
<transcript_timing>{timing}</transcript_timing>
<description>{description[:3000]}</description>
</video>

<transcript segments="{len(segments)}">
{transcript}
</transcript>

<focus>{FOCUS_GUIDE.get(focus, FOCUS_GUIDE["auto"])}</focus>

Find up to {target} of the best clip-worthy moments for this focus (fewer if the material doesn't support that many). Order them best first."""

    with client().beta.messages.stream(
        model=settings.anthropic_model,
        max_tokens=64000,
        betas=[FALLBACK_BETA],
        fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        output_format=AnalysisResult,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        message = stream.get_final_message()

    if message.stop_reason == "refusal":
        raise RuntimeError("The AI declined to analyse this video's content.")
    if message.stop_reason == "max_tokens":
        raise RuntimeError("The AI response was cut off. Please retry.")
    parsed = message.parsed_output
    if not parsed:
        raise RuntimeError("The AI returned an unreadable result. Please retry.")
    return parsed.summary.strip(), finalize_clips(parsed.clips, segments)
