import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK_BETA } from "./anthropic";
import { env } from "../env";
import { estimateTiming, normalize, parseVttOrSrt, type Segment } from "../captions/parse";

/**
 * Agent browser-fetch fallback.
 *
 * When our servers are blocked (YouTube bot checks, rate limits), Claude's
 * server-side web_fetch tool retrieves the caption sources from Anthropic's
 * infrastructure instead. It may only fetch the URLs we list, on the video's
 * own domains.
 */

const AgentResult = z.object({
  found: z.boolean().describe("true only if real transcript text was retrieved"),
  format: z.enum(["vtt", "timed_lines", "plain", "none"]),
  vtt: z.string().describe("If a WebVTT/SRT/timed caption document was fetched, its cues re-emitted as WebVTT; else empty"),
  timed_lines: z
    .array(z.object({ start: z.number().describe("seconds"), text: z.string() }))
    .describe("Timestamped lines if the source shows timestamps but isn't VTT; else empty"),
  plain_text: z.string().describe("Transcript text without timings if that is all that was available; else empty"),
  source_url: z.string().describe("The URL the transcript came from, or empty"),
  note: z.string().describe("One sentence on what was found or why nothing was found"),
});

export interface AgentFetchResult {
  segments: Segment[];
  timing: "exact" | "estimated";
  note: string;
}

export async function agentFetchCaptions(opts: {
  pageUrl: string;
  candidateUrls: string[];
  allowedDomains: string[];
  durationSec: number | null;
}): Promise<AgentFetchResult | null> {
  const urls = [opts.pageUrl, ...opts.candidateUrls].slice(0, 8);
  const prompt = `Retrieve the spoken-word transcript (captions/subtitles) of this video so it can be clipped.

Fetch these URLs in order until one yields caption text. Stop as soon as you have real caption text:
${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}

Rules:
- Only report text that actually appears in a fetched document. Never write, summarise or reconstruct a transcript yourself.
- If a document is WebVTT, SRT or YouTube timed text, re-emit all of its cues as WebVTT in "vtt" (format "vtt").
- If you only find timestamped lines, use "timed_lines". If only untimed text, use "plain_text".
- If none of the URLs contain captions, return found=false and format "none".`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const params = {
    model: env.anthropicModel,
    max_tokens: 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    output_config: { effort: "low" as const, format: zodOutputFormat(AgentResult) },
    tools: [
      {
        type: "web_fetch_20260209" as const,
        name: "web_fetch" as const,
        max_uses: 6,
        allowed_domains: opts.allowedDomains,
        max_content_tokens: 120000,
      },
    ],
  };

  // Server tools can pause long turns; continue up to a few times.
  for (let turn = 0; turn < 4; turn++) {
    const message = await anthropic().beta.messages.stream({ ...params, messages }).finalMessage();
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
    const r = message.parsed_output;
    if (!r || !r.found) return null;

    if (r.format === "vtt" && r.vtt.includes("-->")) {
      const segs = parseVttOrSrt(r.vtt);
      if (segs.length) return { segments: segs, timing: "exact", note: noteFor(r.source_url, "timed captions") };
    }
    if (r.timed_lines.length >= 3) {
      const lines = [...r.timed_lines].sort((a, b) => a.start - b.start);
      const segs = normalize(
        lines.map((l, i) => ({ start: l.start, end: lines[i + 1]?.start ?? l.start + 5, text: l.text })),
      );
      if (segs.length) return { segments: segs, timing: "exact", note: noteFor(r.source_url, "timestamped lines") };
    }
    if (r.plain_text.trim().split(/\s+/).length > 40) {
      return {
        segments: estimateTiming(r.plain_text, opts.durationSec),
        timing: "estimated",
        note: `${noteFor(r.source_url, "untimed text")} Placement is estimated from word count, so check in/out points in the editor.`,
      };
    }
    return null;
  }
  return null;
}

function noteFor(url: string, what: string) {
  return `Retrieved by the AI fetch agent as ${what}${url ? ` from ${safeHost(url)}` : ""}.`;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "the source";
  }
}
