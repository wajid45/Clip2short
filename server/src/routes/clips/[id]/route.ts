import { z } from "zod";
import { db } from "@server/lib/db";
import { apiUser, handle, HttpError, json, parseBody } from "@server/lib/api";
import { CLIP_STATUSES } from "@server/lib/clips";
import { CATEGORIES } from "@server/lib/ai/clipper";
import { getSegments } from "@server/lib/video/pipeline";
import { transcriptText } from "@server/lib/captions/parse";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z
  .object({
    title: z.string().trim().min(1).max(120),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    status: z.enum(CLIP_STATUSES),
    category: z.enum(CATEGORIES).nullable(),
    hook: z.string().max(500),
    caption: z.string().max(5000),
    hashtags: z.string().max(500),
    notes: z.string().max(10000),
  })
  .partial();

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const clip = await db.clip.findFirst({ where: { id, userId: user.id }, include: { video: true } });
  if (!clip) throw new HttpError(404, "Clip not found.");
  const body = await parseBody(req, Patch);
  const start = body.startSec ?? clip.startSec;
  const end = body.endSec ?? clip.endSec;
  if (end - start < 1) throw new HttpError(400, "The out point must be at least 1 second after the in point.");
  if (clip.video.durationSec && end > clip.video.durationSec + 1) throw new HttpError(400, "The out point is past the end of the video.");
  const timingChanged = body.startSec !== undefined || body.endSec !== undefined;
  const updated = await db.clip.update({
    where: { id },
    data: {
      ...body,
      hashtags: body.hashtags?.replace(/#/g, "").replace(/\s+/g, " ").trim(),
      ...(timingChanged ? { transcript: transcriptText(getSegments(clip.video), start, end) } : {}),
    },
  });
  return json({ clip: updated });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const { count } = await db.clip.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new HttpError(404, "Clip not found.");
  return json({ ok: true });
});
