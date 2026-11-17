import "server-only";
import type { Video } from "@prisma/client";
import { db } from "../db";
import type { ParsedSource } from "./source";
import { youtubeThumb } from "./source";
import { fetchOEmbed, fetchWatchPage, pullYouTubeCaptions, type YouTubePlayerData } from "../captions/youtube";
import { fetchVimeoMeta, pullVimeoCaptions } from "../captions/vimeo";
import { pullSiblingCaptions, titleFromFileUrl } from "../captions/direct";
import { agentFetchCaptions } from "../ai/agent-fetch";
import { aiConfigured, describeAiError } from "../ai/anthropic";
import { analyzeTranscript, type Focus } from "../ai/clipper";
import type { Segment } from "../captions/parse";
import { analysisCost } from "../plans";
import { InsufficientCredits, refundCredits, spendCredits } from "../credits";

export interface ResolvedMeta {
  title: string;
  description: string;
  author: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  youtube?: YouTubePlayerData | null;
}

/** Reads title, length and description from the link itself. */
export async function resolveMetadata(src: ParsedSource, clientDuration?: number | null): Promise<ResolvedMeta> {
  if (src.platform === "youtube" && src.externalId) {
    const [watch, oembed] = await Promise.all([
      fetchWatchPage(src.externalId).catch(() => null),
      fetchOEmbed(src.externalId),
    ]);
    if (!watch && !oembed) throw new Error("We couldn't open that YouTube video. Check that it's public or unlisted.");
    if (watch?.playabilityStatus === "ERROR")
      throw new Error(watch.playabilityReason ?? "That YouTube video is unavailable.");
    return {
      title: watch?.title || oembed?.title || "YouTube video",
      description: watch?.description ?? "",
      author: watch?.author ?? oembed?.author ?? null,
      durationSec: watch?.lengthSeconds ?? clientDuration ?? null,
      thumbnailUrl: youtubeThumb(src.externalId),
      youtube: watch,
    };
  }
  if (src.platform === "vimeo" && src.externalId) {
    const m = await fetchVimeoMeta(src.canonicalUrl, src.externalId);
    if (!m.title) throw new Error("We couldn't open that Vimeo video. Private videos need their share link (with the hash).");
    return {
      title: m.title,
      description: m.description ?? "",
      author: m.author ?? null,
      durationSec: m.durationSec ?? clientDuration ?? null,
      thumbnailUrl: m.thumbnailUrl ?? null,
    };
  }
  return {
    title: titleFromFileUrl(src.canonicalUrl),
    description: "",
    author: null,
    durationSec: clientDuration ?? null,
    thumbnailUrl: null,
  };
}

export function getSegments(v: Pick<Video, "transcriptJson">): Segment[] {
  if (!v.transcriptJson) return [];
  try {
    return JSON.parse(v.transcriptJson) as Segment[];
  } catch {
    return [];
  }
}

/** Tries every caption strategy for the platform, then the AI fetch agent. Persists the outcome. */
export async function pullCaptions(videoId: string, opts: { youtube?: YouTubePlayerData | null } = {}) {
  const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
  await db.video.update({ where: { id: videoId }, data: { captionStatus: "pending", captionNote: "Fetching captions…" } });

  const attempts: string[] = [];
  let segments: Segment[] | null = null;
  let source: string | null = null;
  let language: string | null = null;
  let timing: "exact" | "estimated" = "exact";
  let note = "";
  const candidateUrls: string[] = [];
  let allowedDomains: string[] = [];

  try {
    if (video.platform === "youtube" && video.externalId) {
      const r = await pullYouTubeCaptions(video.externalId, opts.youtube);
      attempts.push(...r.attempts);
      if (r.result) ({ segments, source, language, note } = r.result);
      if (!video.durationSec && r.player?.lengthSeconds)
        await db.video.update({ where: { id: videoId }, data: { durationSec: r.player.lengthSeconds } });
      for (const t of r.player?.tracks ?? []) candidateUrls.push(`${t.baseUrl}&fmt=vtt`);
      candidateUrls.push(`https://www.youtube.com/api/timedtext?v=${video.externalId}&lang=en&fmt=vtt`);
      allowedDomains = ["youtube.com", "www.youtube.com", "youtu.be"];
    } else if (video.platform === "vimeo" && video.externalId) {
      const r = await pullVimeoCaptions(video.externalId);
      attempts.push(...r.attempts);
      if (r.result) ({ segments, source, language, note } = r.result);
      const [id, hash] = video.externalId.split(":");
      candidateUrls.push(`https://player.vimeo.com/video/${id}/config${hash ? `?h=${hash}` : ""}`);
      allowedDomains = ["vimeo.com", "player.vimeo.com", "vimeocdn.com"];
    } else {
      const r = await pullSiblingCaptions(video.sourceUrl);
      attempts.push(...r.attempts);
      if (r.result) ({ segments, source, language, note } = r.result);
      allowedDomains = [new URL(video.sourceUrl).hostname];
    }

    // Agent browser-fetch fallback (YouTube/Vimeo only; it runs on Anthropic's infrastructure).
    if (!segments && aiConfigured() && video.platform !== "direct") {
      try {
        const r = await agentFetchCaptions({
          pageUrl: video.sourceUrl,
          candidateUrls,
          allowedDomains,
          durationSec: video.durationSec,
        });
        if (r) {
          segments = r.segments;
          timing = r.timing;
          source = "agent:fetch";
          note = r.note;
        } else attempts.push("AI fetch agent: no captions found");
      } catch (e) {
        attempts.push(`AI fetch agent: ${describeAiError(e)}`);
      }
    }
  } catch (e) {
    attempts.push(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (segments && segments.length) {
    await db.video.update({
      where: { id: videoId },
      data: {
        captionStatus: "ready",
        captionSource: source,
        captionTiming: timing,
        captionLanguage: language,
        captionNote: note,
        transcriptJson: JSON.stringify(segments),
      },
    });
    return true;
  }
  await db.video.update({
    where: { id: videoId },
    data: {
      captionStatus: "missing",
      captionSource: null,
      captionTiming: null,
      captionNote: `We couldn't get captions automatically. Paste a transcript to continue. Tried: ${attempts.join("; ") || "all sources"}.`,
    },
  });
  return false;
}

/** Runs the AI clipper. Keeps clips the user has touched; replaces untouched AI ideas. */
export async function runAnalysis(videoId: string, focus: Focus = "auto") {
  const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
  const segments = getSegments(video);
  if (!segments.length) {
    await db.video.update({
      where: { id: videoId },
      data: { analysisStatus: "failed", analysisError: "Captions are needed before AI can find moments." },
    });
    return;
  }
  if (!aiConfigured()) {
    await db.video.update({
      where: { id: videoId },
      data: { analysisStatus: "failed", analysisError: "AI analysis isn't configured on this server (missing ANTHROPIC_API_KEY)." },
    });
    return;
  }
  // Charge credits before the AI call; refund automatically if analysis fails.
  const duration = video.durationSec ?? segments.at(-1)?.end ?? 60;
  const rerun = video.analysisCount > 0;
  const cost = analysisCost(duration, rerun);
  let spendId: string;
  try {
    spendId = await spendCredits(
      video.userId,
      cost,
      `${rerun ? "Re-ran moments on" : "Found moments in"} “${video.title.slice(0, 80)}” (${Math.round(duration / 60)} min)`,
      video.id,
    );
  } catch (e) {
    await db.video.update({
      where: { id: videoId },
      data: {
        analysisStatus: "failed",
        analysisError:
          e instanceof InsufficientCredits
            ? `Not enough credits: finding moments here needs ${e.needed} and you have ${e.available}. Buy credits or upgrade in Billing.`
            : (e as Error).message,
      },
    });
    return;
  }

  await db.video.update({ where: { id: videoId }, data: { analysisStatus: "running", analysisError: null } });
  try {
    const { summary, clips } = await analyzeTranscript({
      title: video.title,
      description: video.description,
      durationSec: video.durationSec,
      segments,
      timing: (video.captionTiming as "exact" | "estimated") ?? "exact",
      focus,
    });
    await db.$transaction([
      db.clip.deleteMany({ where: { videoId, origin: "ai", status: "idea", posts: { none: {} } } }),
      db.clip.createMany({
        data: clips.map((c) => ({
          userId: video.userId,
          videoId,
          origin: "ai",
          status: "idea",
          title: c.title,
          startSec: c.startSec,
          endSec: c.endSec,
          hook: c.hook,
          caption: c.caption,
          hashtags: c.hashtags,
          category: c.category,
          score: c.score,
          scoreHook: c.scoreHook,
          scoreSelf: c.scoreSelf,
          scorePayoff: c.scorePayoff,
          scoreQuote: c.scoreQuote,
          reason: c.reason,
          transcript: c.transcript,
        })),
      }),
      db.video.update({
        where: { id: videoId },
        data: {
          analysisStatus: "done",
          analysisCount: { increment: 1 },
          analyzedAt: new Date(),
          summary,
          analysisError: clips.length ? null : "The AI didn't find any moments strong enough to clip.",
        },
      }),
    ]);
  } catch (e) {
    console.error("[analysis] failed", e);
    await refundCredits(spendId, `Refund: analysis of “${video.title.slice(0, 80)}” failed`);
    await db.video.update({
      where: { id: videoId },
      data: { analysisStatus: "failed", analysisError: `${describeAiError(e)} Your ${cost} credits were refunded.` },
    });
  }
}

/** Full import pipeline, run after the import request responds. */
export async function processVideo(videoId: string, youtube?: YouTubePlayerData | null) {
  const ok = await pullCaptions(videoId, { youtube });
  if (!ok) return;
  const v = await db.video.findUnique({ where: { id: videoId }, select: { analysisFocus: true } });
  await runAnalysis(videoId, (v?.analysisFocus as Focus) ?? "auto");
}
