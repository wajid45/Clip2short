import { after } from "next/server";
import { db } from "@/lib/db";
import { apiUser, handle, HttpError, json } from "@/lib/api";
import { publishPost } from "@/lib/social/publisher";
import { accountContext } from "@/lib/social";
import { setPrivacy } from "@/lib/social/youtube";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const post = await db.post.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, liveUrl: true, error: true, publishedAt: true, scheduledAt: true },
  });
  if (!post) throw new HttpError(404, "Post not found.");
  return json(post);
});

/** Post now (for queued/scheduled posts) or retry (for failed posts). */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const post = await db.post.findFirst({ where: { id, userId: user.id } });
  if (!post) throw new HttpError(404, "Post not found.");
  if (!["queued", "scheduled", "failed"].includes(post.status)) throw new HttpError(409, `This post is already ${post.status}.`);
  await db.post.update({ where: { id }, data: { scheduledAt: null, status: post.status === "failed" ? "failed" : "queued" } });
  after(() => publishPost(id));
  return json({ ok: true });
});

/** Cancel a queued, scheduled, failed or in-progress upload post. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const post = await db.post.findFirst({ where: { id, userId: user.id }, include: { account: true } });
  if (!post || !["queued", "scheduled", "failed", "uploading"].includes(post.status))
    throw new HttpError(409, "Only queued, scheduled, uploading or failed posts can be canceled.");

  // A scheduled YouTube upload already sits on the channel as private + publishAt: clear the schedule.
  if (post.platform === "youtube" && post.externalId && post.status === "scheduled" && post.account) {
    try {
      await setPrivacy(await accountContext(post.account), post.externalId, "private");
    } catch (e) {
      throw new HttpError(502, `Couldn't cancel on YouTube: ${(e as Error).message}`);
    }
  }
  await db.post.update({
    where: { id },
    data: {
      status: "canceled",
      uploadUrl: null,
      error: post.platform === "youtube" && post.externalId ? "Canceled. The video stays on your channel as private." : null,
    },
  });
  return json({ ok: true });
});
