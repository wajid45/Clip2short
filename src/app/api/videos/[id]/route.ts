import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, handle, HttpError, json, parseBody } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

async function ownVideo(userId: string, id: string) {
  const v = await db.video.findFirst({ where: { id, userId } });
  if (!v) throw new HttpError(404, "Video not found.");
  return v;
}

/** Polling endpoint for import/analysis progress. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const v = await ownVideo(user.id, id);
  const clipCount = await db.clip.count({ where: { videoId: id } });
  return json({
    id: v.id,
    title: v.title,
    durationSec: v.durationSec,
    captionStatus: v.captionStatus,
    captionNote: v.captionNote,
    captionTiming: v.captionTiming,
    analysisStatus: v.analysisStatus,
    analysisError: v.analysisError,
    clipCount,
  });
});

const Patch = z.object({ durationSec: z.number().positive().max(24 * 3600) });

/** The in-app player reports the true duration once metadata loads (used for direct files). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const v = await ownVideo(user.id, id);
  const { durationSec } = await parseBody(req, Patch);
  if (!v.durationSec || Math.abs(v.durationSec - durationSec) > 2)
    await db.video.update({ where: { id }, data: { durationSec } });
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  await ownVideo(user.id, id);
  await db.video.delete({ where: { id } });
  return json({ ok: true });
});
