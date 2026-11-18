import { z } from "zod";
import { db } from "@server/lib/db";
import { apiSubscriber, handle, HttpError, json, parseBody } from "@server/lib/api";
import { assertCanQueuePosts } from "@server/lib/usage";
import { accountContext } from "@server/lib/social";
import { startUpload, YT_CHUNK } from "@server/lib/social/youtube";
import { PublishError } from "@server/lib/social/types";


const Body = z.object({
  clipId: z.string(),
  accountId: z.string(),
  title: z
    .string()
    .trim()
    .min(1, "Add a title")
    .max(100, "YouTube titles are limited to 100 characters")
    .refine((t) => !/[<>]/.test(t), "YouTube titles can't contain < or >"),
  description: z.string().max(5000, "YouTube descriptions are limited to 5,000 characters"),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  privacy: z.enum(["public", "unlisted", "private"]),
  madeForKids: z.boolean(),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  size: z.number().int().positive().max(4 * 1024 ** 3, "Files up to 4 GB are supported"),
  mimeType: z.string().regex(/^video\//, "Choose a video file"),
});

/** Opens a YouTube upload: creates the post record and a resumable session. */
export const POST = handle(async (req: Request) => {
  const user = await apiSubscriber();
  const b = await parseBody(req, Body);
  const [clip, account] = await Promise.all([
    db.clip.findFirst({ where: { id: b.clipId, userId: user.id } }),
    db.socialAccount.findFirst({ where: { id: b.accountId, userId: user.id, platform: "youtube" } }),
  ]);
  if (!clip) throw new HttpError(404, "Clip not found.");
  if (!account) throw new HttpError(404, "YouTube channel not found.");
  if (account.status !== "active") throw new HttpError(400, "This YouTube channel needs to be reconnected.");

  const when = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (when && when.getTime() < Date.now() + 5 * 60e3) throw new HttpError(400, "Schedule YouTube uploads at least 5 minutes ahead.");
  if (when && when.getTime() > Date.now() + 180 * 864e5) throw new HttpError(400, "Schedule within the next 6 months.");
  if (when) await assertCanQueuePosts(user, 1);

  const post = await db.post.create({
    data: {
      userId: user.id,
      clipId: clip.id,
      accountId: account.id,
      accountName: account.username ? `@${account.username}` : account.displayName,
      platform: "youtube",
      text: `${b.title}\n\n${b.description}`.trim(),
      status: "uploading",
      scheduledAt: when,
      privacy: when ? "public" : b.privacy,
      uploadSize: b.size,
    },
  });
  try {
    const ctx = await accountContext(account);
    const uploadUrl = await startUpload(ctx, {
      title: b.title,
      description: b.description,
      tags: b.tags,
      privacy: b.privacy,
      publishAt: when,
      madeForKids: b.madeForKids,
      size: b.size,
      mimeType: b.mimeType,
    });
    await db.post.update({ where: { id: post.id }, data: { uploadUrl } });
  } catch (e) {
    await db.post.delete({ where: { id: post.id } });
    throw new HttpError(e instanceof PublishError ? 400 : 502, (e as Error).message);
  }
  return json({ postId: post.id, chunkSize: YT_CHUNK }, 201);
});
