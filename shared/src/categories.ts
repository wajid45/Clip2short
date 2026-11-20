/**
 * Video categories. The user picks one when importing a link; it chooses the AI engine (its own
 * model, reasoning effort and highlight brief) in backend/app/ai/engines.py. Keep the ids, clip
 * lengths and moment labels in sync with that file.
 */
export type CategoryId = "podcast" | "gaming" | "movies" | "sports" | "other";

export interface Category {
  id: CategoryId;
  label: string;
  engine: string;
  /** URL slug for the landing page's engine page. */
  slug: string;
  /** What the engine looks for, shown under the picker. */
  looksFor: string;
  /** One paragraph for the engine's landing page. */
  summary: string;
  /** Ideal clip length range, in seconds. */
  clipSeconds: [number, number];
  /** Moment labels the engine tags clips with. */
  labels: string[];
  /** Typical sources for this category. */
  sources: string[];
  /** Show a reminder about rights when this category is picked. */
  rightsSensitive: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "podcast",
    label: "Podcasts",
    engine: "Podcast engine",
    slug: "podcasts",
    looksFor: "Hot takes, stories, advice and quotable lines",
    summary:
      "Long conversations hide the lines people repeat. The podcast engine reads the whole episode for strong opinions, stories with a payoff, surprising numbers and advice, and starts each clip on the claim rather than the question.",
    clipSeconds: [30, 75],
    labels: ["Hot take", "Story", "Advice", "Debate", "Big reveal", "Funny moment", "Quote"],
    sources: ["Video podcasts", "Interviews", "Panels and talk shows"],
    rightsSensitive: false,
  },
  {
    id: "gaming",
    label: "Gaming",
    engine: "Gaming engine",
    slug: "gaming",
    looksFor: "Clutch plays, wins, fails and chat reactions",
    summary:
      "On a stream, what happens on screen shows up in the streamer's voice: the shout, the laugh, the sudden silence. The gaming engine treats those reactions as event markers and builds each clip around the build-up, the play and the reaction.",
    clipSeconds: [15, 45],
    labels: ["Clutch play", "Big win", "Fail", "Rage moment", "Funny moment", "Chat reaction", "Boss fight"],
    sources: ["Twitch and YouTube VODs", "Let's plays", "Speedruns and tournaments"],
    rightsSensitive: false,
  },
  {
    id: "movies",
    label: "Movies",
    engine: "Film & TV engine",
    slug: "movies",
    looksFor: "Iconic lines, plot twists and big scenes",
    summary:
      "For films and episodes you have the rights to, and for reviews, recaps and reactions. The film engine finds iconic lines, twists and emotional peaks, and in reviews the verdict and the hottest take, while keeping captions spoiler-free.",
    clipSeconds: [20, 60],
    labels: ["Iconic line", "Plot twist", "Emotional scene", "Action peak", "Funny scene", "Verdict", "Reaction"],
    sources: ["Your own films and series", "Reviews and recaps", "Reaction videos"],
    rightsSensitive: true,
  },
  {
    id: "sports",
    label: "Sports",
    engine: "Sports engine",
    slug: "sports",
    looksFor: "Goals, saves, match winners and celebrations",
    summary:
      "A spike in commentary marks a play. The sports engine starts a few seconds before the play develops and ends after the call, names the event and the score when it hears them, and catches the post-match quotes.",
    clipSeconds: [15, 45],
    labels: ["Goal event", "Big save", "Match winner", "Red card", "Comeback", "Celebration", "Post-match quote"],
    sources: ["Matches you have the rights to", "Fan and watch-along streams", "Sports podcasts and shows"],
    rightsSensitive: true,
  },
  {
    id: "other",
    label: "Other",
    engine: "General engine",
    slug: "general",
    looksFor: "The strongest moments of any kind",
    summary:
      "Talks, tutorials, vlogs and IRL streams. The general engine weighs every kind of moment, from a clear insight to a big laugh, and keeps the clip that would stand on its own.",
    clipSeconds: [25, 60],
    labels: ["Insight", "Story", "Funny moment", "How-to", "Hot take", "Emotional moment", "Big moment"],
    sources: ["Talks and webinars", "Tutorials", "Vlogs and IRL streams"],
    rightsSensitive: false,
  },
];

export function categoryOf(id: string | null | undefined): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const isCategory = (v: string | null | undefined): v is CategoryId => CATEGORIES.some((c) => c.id === v);

/** Words in a title or description that suggest a category (first match wins). Used to pre-select the picker. */
const HINTS: [CategoryId, RegExp][] = [
  ["sports", /\b(vs\.?|v\.|match|highlights?|goal|league|cup|nba|nfl|nhl|mlb|ufc|f1|formula 1|premier league|la liga|champions league|world cup|cricket|football|soccer|basketball|tennis|boxing|fight night)\b/i],
  ["gaming", /\b(gameplay|let'?s play|walkthrough|speedrun|stream(ing)?|vod|twitch|fortnite|minecraft|valorant|warzone|call of duty|cod|apex|league of legends|lol|gta|elden ring|roblox|overwatch|cs2|counter-?strike|dota|pubg|playthrough|ranked|esports)\b/i],
  ["podcast", /\b(podcast|episode|ep\.?\s?\d+|interview|conversation|talk show|q&a|ama)\b/i],
  ["movies", /\b(movie|film|trailer|scene|review|recap|reaction|season \d+|episode \d+ recap|netflix|hbo|marvel|cinema)\b/i],
];

/** Best guess at a category from a video's title and description, or null when nothing fits. */
export function guessCategory(text: string): CategoryId | null {
  for (const [id, re] of HINTS) if (re.test(text)) return id;
  return null;
}
