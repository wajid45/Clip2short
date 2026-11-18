import { db } from "../db";
import { env } from "../env";
import { accountContext, getProvider } from "./index";
import { PublishError } from "./types";
import { timestampUrl } from "../video/source";
import { loadIntegrations } from "../integrations";
import { getVideo, setPrivacy, youtubeUrl } from "./youtube";
import type { AccountContext } from "./types";

const MAX_ATTEMPTS = 3;

/** Thumbnail URL served from our own domain (Instagram pulls the post image from it). */
export function clipImageUrl(clipId: string) {
  return `${env.appUrl}/api/media/thumb/${clipId}`;
}

/**
 * Publishes one post. Claims it atomically (status → publishing) so concurrent
 * cron runs and "Post now" clicks can never double-publish.
 */
export async function publishPost(postId: string): Promise<void> {
  await loadIntegrations();
  const claimed = await db.post.updateMany({
    where: { id: postId, status: { in: ["queued", "scheduled", "failed"] } },
    data: { status: "publishing", attempts: { increment: 1 }, error: null },
  });
  if (claimed.count === 0) return;

  const post = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: { account: true, clip: { include: { video: true } } },
  });
  const provider = getProvider(post.platform);
  try {
    if (!provider || !provider.configured()) throw new PublishError(`${post.platform} publishing isn't configured on this server.`);
    if (!post.account) throw new PublishError("The account for this post was disconnected.");
    if (post.account.status !== "active") throw new PublishError("This account needs to be reconnected.");
    const ctx = await accountContext(post.account);
    if (post.platform === "youtube") {
      await confirmYouTube(ctx, post.id, post.externalId, (post.privacy as "public" | "unlisted" | "private") ?? "public");
      await markClipPublished(post.clipId);
      return;
    }
    const v = post.clip.video;
    const result = await provider.publish(ctx, {
      text: post.text,
      title: post.clip.title,
      link: timestampUrl(v, post.clip.startSec),
      imageUrl: v.thumbnailUrl ? clipImageUrl(post.clipId) : null,
    });
    await db.post.update({
      where: { id: postId },
      data: {
        status: result.pending ? "publishing" : "published",
        externalId: result.externalId,
        liveUrl: result.liveUrl,
        publishedAt: result.pending ? null : new Date(),
      },
    });
    if (!result.pending) await markClipPublished(post.clipId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const retryable = e instanceof PublishError ? e.retryable : false;
    const retry = retryable && post.attempts < MAX_ATTEMPTS;
    await db.post.update({
      where: { id: postId },
      data: {
        status: retry ? "scheduled" : "failed",
        // Back off 15 minutes so the next cron tick retries a transient failure.
        scheduledAt: retry ? new Date(Date.now() + 15 * 60e3) : post.scheduledAt,
        error: retry ? `Temporary error, retrying: ${message}` : message,
      },
    });
  }
}

/**
 * YouTube posts are uploaded up front (scheduled ones as private + publishAt, which YouTube flips itself).
 * Publishing therefore means: make sure the video has the requested visibility, then record the live link.
 */
async function confirmYouTube(ctx: AccountContext, postId: string, videoId: string | null, privacy: "public" | "unlisted" | "private") {
  if (!videoId) throw new PublishError("The video upload never finished. Upload it again from the clip.");
  let video = await getVideo(ctx, videoId);
  if (!video) throw new PublishError("This video no longer exists on YouTube.");
  if (video.status?.uploadStatus === "rejected" || video.status?.uploadStatus === "failed")
    throw new PublishError(`YouTube ${video.status.uploadStatus} the video (${video.status.rejectionReason ?? video.status.failureReason ?? "no reason given"}).`);
  if (video.status?.privacyStatus !== privacy) {
    await setPrivacy(ctx, videoId, privacy);
    video = await getVideo(ctx, videoId);
    if (video?.status?.privacyStatus !== privacy)
      throw new PublishError(
        "YouTube kept the video private. Videos uploaded through a Google API project that hasn't passed YouTube's audit are locked to private.",
      );
  }
  await db.post.update({
    where: { id: postId },
    data: { status: "published", publishedAt: new Date(), liveUrl: youtubeUrl(videoId), error: null },
  });
}

async function markClipPublished(clipId: string) {
  await db.clip.update({ where: { id: clipId }, data: { status: "published" } });
}

/** Confirms posts the platform was still processing. */
async function confirmPending() {
  const pending = await db.post.findMany({
    where: { status: "publishing", externalId: { not: null }, updatedAt: { lt: new Date(Date.now() - 60e3) } },
    include: { account: true },
    take: 50,
  });
  for (const p of pending) {
    const provider = getProvider(p.platform);
    if (!provider?.checkPending || !p.externalId || !p.account) continue;
    try {
      const r = await provider.checkPending(await accountContext(p.account), p.externalId);
      if (!r) continue;
      if ("failed" in r) await db.post.update({ where: { id: p.id }, data: { status: "failed", error: r.failed } });
      else {
        await db.post.update({
          where: { id: p.id },
          data: { status: "published", externalId: r.externalId, liveUrl: r.liveUrl, publishedAt: new Date() },
        });
        await markClipPublished(p.clipId);
      }
    } catch (e) {
      console.error("[publisher] pending check failed", p.id, e);
    }
  }
}

/** Recovers posts stuck in "publishing" without an external id (e.g. the server restarted mid-publish). */
async function recoverStuck() {
  await db.post.updateMany({
    where: { status: "uploading", updatedAt: { lt: new Date(Date.now() - 6 * 3600e3) } },
    data: { status: "failed", uploadUrl: null, error: "The upload didn't finish. Upload the file again from the clip." },
  });
  await db.post.updateMany({
    where: { status: "publishing", externalId: null, updatedAt: { lt: new Date(Date.now() - 20 * 60e3) } },
    data: { status: "failed", error: "Publishing was interrupted. Check the platform before retrying to avoid a duplicate." },
  });
}

/** Runs every 15 minutes: publishes due posts, confirms pending ones, and refreshes stats. */
export async function runPublisher(): Promise<{ published: number; failed: number; checked: number }> {
  await loadIntegrations(true);
  await recoverStuck();
  const due = await db.post.findMany({
    where: { status: { in: ["queued", "scheduled"] }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
    take: 100,
  });
  for (const p of due) await publishPost(p.id);
  await confirmPending();
  const results = await db.post.groupBy({
    by: ["status"],
    where: { id: { in: due.map((d) => d.id) } },
    _count: true,
  });
  const count = (s: string) => results.find((r) => r.status === s)?._count ?? 0;
  const checked = await refreshStats();
  return { published: count("published"), failed: count("failed"), checked };
}

/** Pulls live stats for posts published in the last 30 days, oldest refresh first. */
export async function refreshStats(opts: { userId?: string; limit?: number } = {}): Promise<number> {
  await loadIntegrations();
  const posts = await db.post.findMany({
    where: {
      status: "published",
      externalId: { not: null },
      publishedAt: { gte: new Date(Date.now() - 30 * 864e5) },
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    include: { account: true },
    orderBy: { statsUpdatedAt: { sort: "asc", nulls: "first" } },
    take: opts.limit ?? 60,
  });
  let n = 0;
  for (const p of posts) {
    const provider = getProvider(p.platform);
    if (!provider?.stats || !p.externalId || !p.account) continue;
    try {
      const s = await provider.stats(await accountContext(p.account), p.externalId);
      await db.post.update({
        where: { id: p.id },
        data: {
          views: s?.views ?? p.views,
          likes: s?.likes ?? p.likes,
          comments: s?.comments ?? p.comments,
          shares: s?.shares ?? p.shares,
          statsUpdatedAt: new Date(),
        },
      });
      n++;
    } catch (e) {
      await db.post.update({ where: { id: p.id }, data: { statsUpdatedAt: new Date() } });
      console.warn("[stats] refresh failed", p.id, (e as Error).message);
    }
  }
  return n;
}
