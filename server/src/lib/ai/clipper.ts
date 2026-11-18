import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, FALLBACK_BETA } from "./anthropic";
import { env } from "../env";
import { transcriptText, type Segment } from "../captions/parse";

/**
 * The AI auto-clipper.
 *
 * Design choices (informed by open-source auto-clippers):
 * - The model returns segment *indices*, never seconds; timestamps come from the
 *   measured caption timings, so the model can't drift or invent times.
 * - It scores against an explicit rubric with bands and may return fewer clips
 *   rather than pad the list.
 * - It returns the verbatim opening words (the hook) so we can check the start.
 */

export const CATEGORIES = ["insight", "story", "humor", "hot-take", "how-to", "emotional", "data", "quote", "event"] as const;

/** What the AI should prioritise when finding moments. */
export const FOCUSES = {
  auto: "Best moments",
  events: "Main events",
  funny: "Funniest moments",
  insights: "Insights and advice",
} as const;
export type Focus = keyof typeof FOCUSES;

const FOCUS_GUIDE: Record<Focus, string> = {
  auto: "Pick the strongest moments of any kind: key events, peak reactions, stories, insights and jokes.",
  events:
    "Prioritise the MAIN EVENTS: turning points, big plays, wins and fails, reveals, announcements and peak reactions (shouting, laughter, stunned silence, chat going wild). In gaming and live streams the transcript shows events through the streamer's reactions and narration (\"no way\", \"let's go\", \"he's right behind me\", sudden swearing, laughter cues): treat those as event markers. Start each clip just before the event builds and end it after the reaction lands. Use category \"event\" for these.",
  funny:
    "Prioritise the funniest moments: jokes that land, banter, fails, absurd situations and genuine laughter. The punchline must be inside the clip.",
  insights:
    "Prioritise insights and advice: clear lessons, counter-intuitive claims backed by a reason, concrete numbers and step-by-step how-tos.",
};
export type Category = (typeof CATEGORIES)[number];

const ClipSchema = z.object({
  start_segment: z.number().int().describe("Index of the first transcript segment of the clip"),
  end_segment: z.number().int().describe("Index of the last transcript segment of the clip (inclusive)"),
  title: z.string().describe("Editor-style working title, under 60 characters"),
  hook: z.string().describe("The verbatim opening words a viewer hears, up to ~15 words"),
  caption: z.string().describe("Ready-to-post social caption, 1-3 short sentences, no hashtags"),
  hashtags: z.array(z.string()).describe("3-5 relevant hashtags without the # symbol"),
  category: z.enum(CATEGORIES),
  score_hook: z.number().int().describe("0-100: does the first 3 seconds stop the scroll?"),
  score_self_contained: z.number().int().describe("0-100: understandable with zero context?"),
  score_payoff: z.number().int().describe("0-100: clear takeaway, punchline or resolution?"),
  score_quotability: z.number().int().describe("0-100: a line people would repeat or share?"),
  score: z.number().int().describe("Overall 0-100 virality score"),
  reason: z.string().describe("One or two sentences on why this moment was picked, written for the creator"),
});

const ResultSchema = z.object({
  summary: z.string().describe("Two-sentence summary of the whole video"),
  clips: z.array(ClipSchema),
});

export type AiClip = z.infer<typeof ClipSchema>;

const SYSTEM = `You are a senior short-form video editor. You find the moments in long videos that will perform as standalone clips on YouTube Shorts, Instagram Reels and Facebook.

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
- Follow the <focus> instruction in the request when choosing between candidates.`;

function formatTranscript(segments: Segment[]): string {
  return segments.map((s, i) => `[${i}] ${s.start.toFixed(1)}s ${s.text}`).join("\n");
}

export interface AnalyzeInput {
  title: string;
  description: string;
  durationSec: number | null;
  segments: Segment[];
  timing: "exact" | "estimated";
  focus?: Focus;
}

export interface FinalClip {
  title: string;
  startSec: number;
  endSec: number;
  hook: string;
  caption: string;
  hashtags: string;
  category: Category;
  score: number;
  scoreHook: number;
  scoreSelf: number;
  scorePayoff: number;
  scoreQuote: number;
  reason: string;
  transcript: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export function targetClipCount(durationSec: number | null, segmentCount: number): number {
  const minutes = durationSec ? durationSec / 60 : segmentCount / 12;
  return Math.max(3, Math.min(20, Math.round(minutes / 4)));
}

/** Converts model output (segment indices) to validated, de-overlapped clips with real timestamps. */
export function finalizeClips(raw: AiClip[], segments: Segment[]): FinalClip[] {
  const n = segments.length;
  const candidates: FinalClip[] = [];
  for (const c of raw) {
    let s = Math.max(0, Math.min(n - 1, c.start_segment));
    let e = Math.max(0, Math.min(n - 1, c.end_segment));
    if (e < s) [s, e] = [e, s];
    let startSec = segments[s].start;
    let endSec = segments[e].end;
    // Extend very short picks to the minimum length, trim runaway picks.
    while (endSec - startSec < 12 && e < n - 1) endSec = segments[++e].end;
    while (endSec - startSec > 120 && e > s) endSec = segments[--e].end;
    if (endSec - startSec < 5) continue;
    startSec = Math.max(0, startSec - 0.15); // small lead-in so the first word isn't clipped
    const score = clamp(c.score);
    if (score < 50) continue;
    candidates.push({
      title: c.title.trim().slice(0, 90) || "Untitled moment",
      startSec: Math.round(startSec * 10) / 10,
      endSec: Math.round(endSec * 10) / 10,
      hook: c.hook.trim(),
      caption: c.caption.trim(),
      hashtags: c.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 6).join(" "),
      category: c.category,
      score,
      scoreHook: clamp(c.score_hook),
      scoreSelf: clamp(c.score_self_contained),
      scorePayoff: clamp(c.score_payoff),
      scoreQuote: clamp(c.score_quotability),
      reason: c.reason.trim(),
      transcript: transcriptText(segments, startSec, endSec),
    });
  }
  // Remove overlaps, keeping the higher-scoring clip.
  candidates.sort((a, b) => b.score - a.score);
  const kept: FinalClip[] = [];
  for (const c of candidates) {
    const overlaps = kept.some((k) => {
      const ov = Math.min(k.endSec, c.endSec) - Math.max(k.startSec, c.startSec);
      return ov > 0.3 * Math.min(k.endSec - k.startSec, c.endSec - c.startSec);
    });
    if (!overlaps) kept.push(c);
  }
  return kept;
}

export async function analyzeTranscript(input: AnalyzeInput): Promise<{ summary: string; clips: FinalClip[] }> {
  if (input.segments.length < 3) throw new Error("The transcript is too short to find clips.");
  const target = targetClipCount(input.durationSec, input.segments.length);

  const userContent = `<video>
<title>${input.title}</title>
<duration_seconds>${input.durationSec ?? "unknown"}</duration_seconds>
<transcript_timing>${input.timing}</transcript_timing>
<description>${input.description.slice(0, 3000)}</description>
</video>

<transcript segments="${input.segments.length}">
${formatTranscript(input.segments)}
</transcript>

<focus>${FOCUS_GUIDE[input.focus ?? "auto"]}</focus>

Find up to ${target} of the best clip-worthy moments for this focus (fewer if the material doesn't support that many). Order them best first.`;

  const stream = anthropic().beta.messages.stream({
    model: env.anthropicModel,
    max_tokens: 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ResultSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new Error("The AI declined to analyse this video's content.");
  if (message.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Please retry.");
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("The AI returned an unreadable result. Please retry.");

  return { summary: parsed.summary.trim(), clips: finalizeClips(parsed.clips, input.segments) };
}
