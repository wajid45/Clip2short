import { requireSubscriber } from "@server/lib/auth";
import { db } from "@server/lib/db";
import { getSegments } from "@server/lib/video/pipeline";
import { HttpError } from "@server/lib/api";

export async function loadClip(id: string) {
  const user = await requireSubscriber();
  const clip = await db.clip.findFirst({ where: { id, userId: user.id }, include: { video: true } });
  if (!clip) throw new HttpError(404, "Clip not found.");

  const [siblings, accounts, posts] = await Promise.all([
    db.clip.findMany({
      where: { videoId: clip.videoId },
      select: { id: true, title: true, startSec: true, endSec: true, status: true },
    }),
    db.socialAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ platform: "asc" }, { displayName: "asc" }],
      select: { id: true, platform: true, displayName: true, username: true, status: true },
    }),
    db.post.findMany({ where: { clipId: clip.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const v = clip.video;
  return {
    clip: {
      id: clip.id,
      title: clip.title,
      startSec: clip.startSec,
      endSec: clip.endSec,
      status: clip.status,
      category: clip.category,
      hook: clip.hook,
      caption: clip.caption,
      hashtags: clip.hashtags,
      notes: clip.notes,
      transcript: clip.transcript,
      score: clip.score,
      scoreHook: clip.scoreHook,
      scoreSelf: clip.scoreSelf,
      scorePayoff: clip.scorePayoff,
      scoreQuote: clip.scoreQuote,
      reason: clip.reason,
      origin: clip.origin,
    },
    video: {
      id: v.id,
      title: v.title,
      platform: v.platform,
      externalId: v.externalId,
      sourceUrl: v.sourceUrl,
      durationSec: v.durationSec,
      captionTiming: v.captionTiming,
    },
    siblings,
    segments: getSegments(v),
    suggestion: clip.suggestionsJson ? (JSON.parse(clip.suggestionsJson) as unknown) : null,
    canDownload: v.platform === "direct",
    accounts,
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      accountName: p.accountName,
      status: p.status,
      text: p.text,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      liveUrl: p.liveUrl,
      error: p.error,
    })),
  };
}
