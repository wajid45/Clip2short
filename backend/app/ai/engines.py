"""Category engines: each video category gets its own model, reasoning effort and editing brief.

The user picks a category when they paste a link (Podcasts, Gaming, Movies, Sports, Other). The
category decides:
- which Gemini model runs the analysis (GEMINI_MODEL_<CATEGORY>, falling back to GEMINI_MODEL),
- how much the model thinks before answering,
- what counts as a highlight in that kind of video, how long clips should be, and the short
  moment labels shown on each clip ("Goal event", "Clutch play", "Hot take" ...).

Adding a category: add an entry here, a GEMINI_MODEL_<ID> line to .env.example, and the chip in
shared/src/categories.ts.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import settings


@dataclass(frozen=True)
class Engine:
    id: str
    label: str
    engine: str  # shown to the user: "Sports engine"
    thinking: str  # Gemini thinking level: low | medium | high
    clip_seconds: tuple[int, int]  # ideal clip length range
    brief: str
    labels: tuple[str, ...]


ENGINES: dict[str, Engine] = {
    "podcast": Engine(
        id="podcast",
        label="Podcasts",
        engine="Podcast engine",
        thinking="medium",
        clip_seconds=(30, 75),
        brief=(
            "This is a podcast, interview or long-form conversation. Highlights are quotable lines, strong or "
            "contrarian opinions, stories with a payoff, surprising facts and numbers, disagreements between hosts and "
            "guests, and practical advice. Start the clip on the claim itself (never on the host's question unless the "
            "question is the hook) and end after the explanation or the punchline lands."
        ),
        labels=("Hot take", "Story", "Advice", "Debate", "Big reveal", "Funny moment", "Quote"),
    ),
    "gaming": Engine(
        id="gaming",
        label="Gaming",
        engine="Gaming engine",
        thinking="high",
        clip_seconds=(15, 45),
        brief=(
            "This is gameplay or a stream VOD. The transcript is mostly the streamer's commentary, so what happens on "
            "screen shows up through reactions: sudden shouting, laughter, swearing, 'let's go', 'no way', 'chat, did "
            "you see that', panic narration. Highlights are clutch plays, multi-kills, wins, boss kills, fails and "
            "deaths, rage moments, funny bugs and chat interactions. Start a few seconds before the action builds, "
            "include the payoff, and end after the reaction lands."
        ),
        labels=("Clutch play", "Big win", "Fail", "Rage moment", "Funny moment", "Chat reaction", "Boss fight"),
    ),
    "movies": Engine(
        id="movies",
        label="Movies",
        engine="Film & TV engine",
        thinking="high",
        clip_seconds=(20, 60),
        brief=(
            "This is film or TV content: a movie or episode the creator has the rights to, a review, recap, reaction "
            "or film podcast. Highlights are iconic lines, plot twists, emotional peaks, action peaks and funny "
            "exchanges; in reviews and reactions, the verdict, hot takes and comparisons. Keep captions spoiler-free "
            "unless the moment itself is the reveal, and never imply the creator owns material they are reacting to."
        ),
        labels=("Iconic line", "Plot twist", "Emotional scene", "Action peak", "Funny scene", "Verdict", "Reaction"),
    ),
    "sports": Engine(
        id="sports",
        label="Sports",
        engine="Sports engine",
        thinking="high",
        clip_seconds=(15, 45),
        brief=(
            "This is sport: a match broadcast, commentary, a highlights show, a fan stream or a sports podcast. "
            "Highlights are goals and scores, saves, decisive plays, red cards and fouls, comebacks, match winners, "
            "celebrations, the commentators' peak calls ('what a goal!') and post-match quotes. A spike in commentary "
            "energy marks a play: start 5 to 10 seconds before the play develops and end after the call and the first "
            "replay description. Name the event and the score in the title when the transcript gives them."
        ),
        labels=("Goal event", "Big save", "Match winner", "Red card", "Comeback", "Celebration", "Post-match quote"),
    ),
    "other": Engine(
        id="other",
        label="Other",
        engine="General engine",
        thinking="high",
        clip_seconds=(25, 60),
        brief="This is general content: talks, vlogs, tutorials, IRL streams and anything else. Pick the strongest moments of any kind.",
        labels=("Insight", "Story", "Funny moment", "How-to", "Hot take", "Emotional moment", "Big moment"),
    ),
}

CATEGORY_IDS = tuple(ENGINES)


def engine_for(category: str | None) -> Engine:
    return ENGINES.get(category or "other", ENGINES["other"])


def model_for(category: str | None) -> str:
    """GEMINI_MODEL_<CATEGORY> when set, else GEMINI_MODEL."""
    return settings.gemini_category_models.get(engine_for(category).id) or settings.gemini_model
