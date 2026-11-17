import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiSubscriber, handle, HttpError, json, parseBody } from "@/lib/api";
import { parseVideoUrl } from "@/lib/video/source";
import { assertPublicUrl } from "@/lib/video/fetcher";
import { processVideo, resolveMetadata } from "@/lib/video/pipeline";
import { analysisCost, hasActiveSubscription, limitsFor } from "@/lib/plans";
import { getCredits } from "@/lib/credits";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 300;

const Body = z.object({
  url: z.string().trim().min(1, "Paste a video link"),
  /** Duration measured by the browser for direct files (servers can't read it without downloading). */
  clientDuration: z.number().positive().max(24 * 3600).nullable().optional(),
  focus: z.enum(["auto", "events", "funny", "insights"]).optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await apiSubscriber();
  const body = await parseBody(req, Body);
  const parsed = parseVideoUrl(body.url);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  if (parsed.platform === "direct") {
    try {
      await assertPublicUrl(parsed.canonicalUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  await rateLimit(`import:${user.id}`, 30, 60 * 60e3);

  let meta;
  try {
    meta = await resolveMetadata(parsed, body.clientDuration);
  } catch (e) {
    throw new HttpError(422, (e as Error).message);
  }

  const limits = limitsFor(user);
  if (meta.durationSec && meta.durationSec > limits.maxVideoMinutes * 60)
    throw new HttpError(
      402,
      `This video is ${Math.round(meta.durationSec / 60)} minutes long. ${hasActiveSubscription(user) ? "Your plan" : "Without a plan, Shortlark"} handles videos up to ${limits.maxVideoMinutes} minutes.`,
      "limit_reached",
    );
  // Credits are charged when the AI analyses the video; check up front so nobody imports what they can't afford.
  const balance = (await getCredits(user.id)).total;
  const cost = meta.durationSec ? analysisCost(meta.durationSec, false) : 1;
  if (balance < cost)
    throw new HttpError(
      402,
      `Finding moments in this ${Math.round((meta.durationSec ?? 60) / 60)}-minute video needs ${cost} credits and you have ${balance}. Buy credits or upgrade in Billing.`,
      "no_credits",
    );

  const video = await db.video.create({
    data: {
      userId: user.id,
      sourceUrl: parsed.canonicalUrl,
      platform: parsed.platform,
      externalId: parsed.externalId,
      title: meta.title.slice(0, 300),
      description: meta.description.slice(0, 10000),
      author: meta.author,
      durationSec: meta.durationSec,
      thumbnailUrl: meta.thumbnailUrl,
      captionStatus: "pending",
      captionNote: "Fetching captions…",
      analysisStatus: "idle",
      analysisFocus: body.focus ?? "auto",
    },
  });

  // Captions + AI analysis continue after the response; the page polls for progress.
  after(() => processVideo(video.id, meta.youtube).catch((e) => console.error("[import] pipeline failed", e)));

  return json({ id: video.id }, 201);
});
