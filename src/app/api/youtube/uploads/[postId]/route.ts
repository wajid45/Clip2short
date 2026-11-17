import { db } from "@/lib/db";
import { apiUser, handle, HttpError, json } from "@/lib/api";
import { uploadChunk, YT_CHUNK, youtubeUrl } from "@/lib/social/youtube";
import { PublishError } from "@/lib/social/types";

export const maxDuration = 120;

type Ctx = { params: Promise<{ postId: string }> };

/**
 * Receives one chunk of the clip file from the browser (raw body, ?offset=N) and relays it
 * into the YouTube resumable session. Nothing is written to our disk.
 */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { postId } = await params;
  const post = await db.post.findFirst({ where: { id: postId, userId: user.id } });
  if (!post) throw new HttpError(404, "Upload not found.");
  if (post.status !== "uploading" || !post.uploadUrl || !post.uploadSize) throw new HttpError(409, "This upload is no longer active.");

  const offset = Number(new URL(req.url).searchParams.get("offset"));
  if (!Number.isInteger(offset) || offset < 0 || offset >= post.uploadSize) throw new HttpError(400, "Bad offset.");
  const chunk = await req.arrayBuffer();
  const isLast = offset + chunk.byteLength === post.uploadSize;
  if (!chunk.byteLength || chunk.byteLength > YT_CHUNK || (!isLast && chunk.byteLength % 262144 !== 0))
    throw new HttpError(400, "Bad chunk size.");

  let r;
  try {
    r = await uploadChunk(post.uploadUrl, chunk, offset, post.uploadSize);
  } catch (e) {
    const retryable = e instanceof PublishError && e.retryable;
    if (!retryable)
      await db.post.update({ where: { id: postId }, data: { status: "failed", uploadUrl: null, error: (e as Error).message } });
    throw new HttpError(retryable ? 503 : 502, (e as Error).message);
  }

  if (!r.done) {
    await db.post.update({ where: { id: postId }, data: { updatedAt: new Date() } });
    return json({ done: false, received: r.received });
  }

  const videoId: string = r.video.id;
  const scheduled = post.scheduledAt && post.scheduledAt.getTime() > Date.now();
  await db.post.update({
    where: { id: postId },
    data: {
      externalId: videoId,
      uploadUrl: null,
      status: scheduled ? "scheduled" : "published",
      publishedAt: scheduled ? null : new Date(),
      liveUrl: youtubeUrl(videoId),
      error: null,
    },
  });
  await db.clip.update({ where: { id: post.clipId }, data: { status: scheduled ? "ready" : "published" } });
  return json({ done: true, videoId, url: youtubeUrl(videoId), scheduled: Boolean(scheduled) });
});
