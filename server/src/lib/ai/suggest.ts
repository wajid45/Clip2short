import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, FALLBACK_BETA } from "./anthropic";
import { env } from "../env";

/**
 * AI posting copy for one clip: improved clip fields plus ready-to-post text per network.
 * Suggestions are only shown to the user; nothing is applied until they approve it.
 * Links are never written by the model: the app appends the timestamp link itself.
 */

export const SuggestionSchema = z.object({
  title: z.string().describe("Clip working title, under 60 characters, no clickbait the clip doesn't deliver"),
  hook: z.string().describe("The best opening line for the clip, taken from or faithful to the transcript, under 15 words"),
  caption: z.string().describe("General social caption, 1-2 short sentences, no hashtags, no links"),
  hashtags: z.array(z.string()).describe("4-6 relevant hashtags without the # symbol, mixing broad and specific"),
  youtube_title: z.string().describe("YouTube Shorts title under 90 characters; end with #Shorts"),
  youtube_description: z.string().describe("YouTube description: 2-4 short lines, credit the source creator if known, then 3-5 hashtags on the last line. No links."),
  instagram: z.string().describe("Instagram Reels caption: punchy first line, 1-2 more lines, a call to comment, then 5-8 hashtags on their own line. No links."),
  facebook: z.string().describe("Facebook post: 1-3 sentences with a question to drive comments. No hashtags, no links."),
  rationale: z.string().describe("One sentence on the angle chosen for this copy, written for the creator"),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

const SYSTEM = `You are a short-form social media editor who writes posting copy for clips cut from long videos and live streams.

Write copy that makes people stop scrolling and watch, but never promise something the clip does not deliver. Match the tone of the speaker: hype for gaming streams, calm for interviews, playful for comedy. Write in the transcript's language.

Rules:
- Base everything on the clip transcript and the source video's context. Do not invent facts, numbers, names or events.
- Never write URLs or say "link in bio"; the app adds the link.
- No emoji spam: at most one or two, and only where the platform culture expects them (Instagram).
- Respect each field's length limit strictly.
- If the source is someone else's stream, credit them by name when the source title or description makes the name clear.`;

export async function suggestCopy(input: {
  videoTitle: string;
  videoDescription: string;
  author: string | null;
  clipTitle: string;
  transcript: string;
  durationSec: number;
  currentHook: string;
  currentCaption: string;
}): Promise<Suggestion> {
  const content = `<source_video>
<title>${input.videoTitle}</title>
<creator>${input.author ?? "unknown"}</creator>
<description>${input.videoDescription.slice(0, 1500)}</description>
</source_video>

<clip>
<working_title>${input.clipTitle}</working_title>
<length_seconds>${Math.round(input.durationSec)}</length_seconds>
<current_hook>${input.currentHook}</current_hook>
<current_caption>${input.currentCaption}</current_caption>
<transcript>${input.transcript.slice(0, 6000) || "(no transcript available for this range)"}</transcript>
</clip>

Write the posting copy for this clip.`;

  const message = await anthropic().beta.messages.parse({
    model: env.anthropicModel,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(SuggestionSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  if (message.stop_reason === "refusal") throw new Error("The AI declined to write copy for this clip.");
  if (message.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Please retry.");
  if (!message.parsed_output) throw new Error("The AI returned an unreadable result. Please retry.");
  const s = message.parsed_output;
  return { ...s, hashtags: s.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 8) };
}
