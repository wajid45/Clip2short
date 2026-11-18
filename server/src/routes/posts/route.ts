import { after } from "@server/http/after";
import { z } from "zod";
import { db } from "@server/lib/db";
import { apiSubscriber, handle, HttpError, json, parseBody } from "@server/lib/api";
import { assertCanQueuePosts } from "@server/lib/usage";
import { PLATFORMS, platformLength, type SocialPlatform } from "@server/lib/social/types";
import { publishPost } from "@server/lib/social/publisher";


const Body = z.object({
  clipId: z.string(),
  targets: z
    .array(z.object({ accountId: z.string(), text: z.string().trim().min(1, "Post text can't be empty") }))
    .min(1, "Choose at least one account"),
  /** ISO time to schedule, or null to post now. */
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
});

export const POST = handle(async (req: Request) => {
  const user = await apiSubscriber();
  const body = await parseBody(req, Body);
  const clip = await db.clip.findFirst({ where: { id: body.clipId, userId: user.id }, include: { video: true } });
  if (!clip) throw new HttpError(404, "Clip not found.");

  const accounts = await db.socialAccount.findMany({
    where: { userId: user.id, id: { in: body.targets.map((t) => t.accountId) } },
  });
  if (accounts.length !== new Set(body.targets.map((t) => t.accountId)).size) throw new HttpError(400, "Unknown account.");

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (when && when.getTime() < Date.now() - 60e3) throw new HttpError(400, "That time is in the past.");
  if (when && when.getTime() > Date.now() + 180 * 864e5) throw new HttpError(400, "Schedule within the next 6 months.");

  for (const t of body.targets) {
    const acc = accounts.find((a) => a.id === t.accountId)!;
    const info = PLATFORMS[acc.platform as SocialPlatform];
    if (acc.platform === "youtube") throw new HttpError(400, "YouTube needs a video file. Use the YouTube upload form on the clip.");
    if (acc.status !== "active") throw new HttpError(400, `${info.label} (${acc.displayName}) needs to be reconnected.`);
    if (platformLength(info.id, t.text) > info.maxChars)
      throw new HttpError(400, `${info.label} posts are limited to ${info.maxChars} characters.`);
    if (info.needsImage && !clip.video.thumbnailUrl)
      throw new HttpError(400, `${info.label} needs an image, and this video has no thumbnail.`);
  }
  await assertCanQueuePosts(user, body.targets.length);

  const created = await db.$transaction(
    body.targets.map((t) => {
      const acc = accounts.find((a) => a.id === t.accountId)!;
      return db.post.create({
        data: {
          userId: user.id,
          clipId: clip.id,
          accountId: acc.id,
          accountName: acc.username ? `@${acc.username}` : acc.displayName,
          platform: acc.platform,
          text: t.text,
          status: when ? "scheduled" : "queued",
          scheduledAt: when,
        },
      });
    }),
  );
  if (clip.status === "idea" || clip.status === "draft") await db.clip.update({ where: { id: clip.id }, data: { status: "ready" } });

  if (!when) {
    // Publish immediately after responding; the UI polls for the live link or failure reason.
    after(async () => {
      for (const p of created) await publishPost(p.id);
    });
  }
  return json({ ids: created.map((p) => p.id) }, 201);
});
