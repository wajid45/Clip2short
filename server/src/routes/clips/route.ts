import { z } from "zod";
import { db } from "@server/lib/db";
import { apiSubscriber, handle, HttpError, json, parseBody } from "@server/lib/api";
import { getSegments } from "@server/lib/video/pipeline";
import { transcriptText } from "@server/lib/captions/parse";

const Body = z.object({
  videoId: z.string(),
  title: z.string().trim().min(1).max(120).default("New clip"),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
});

/** Manual clip creation from the editor. */
export const POST = handle(async (req: Request) => {
  const user = await apiSubscriber();
  const body = await parseBody(req, Body);
  const video = await db.video.findFirst({ where: { id: body.videoId, userId: user.id } });
  if (!video) throw new HttpError(404, "Video not found.");
  if (body.endSec - body.startSec < 1) throw new HttpError(400, "A clip must be at least 1 second long.");
  if (video.durationSec && body.endSec > video.durationSec + 1) throw new HttpError(400, "The out point is past the end of the video.");
  const clip = await db.clip.create({
    data: {
      userId: user.id,
      videoId: video.id,
      origin: "manual",
      status: "draft",
      title: body.title,
      startSec: body.startSec,
      endSec: body.endSec,
      transcript: transcriptText(getSegments(video), body.startSec, body.endSec),
    },
  });
  return json({ id: clip.id }, 201);
});
