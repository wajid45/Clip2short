import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiSubscriber, handle, HttpError, json, parseBody } from "@/lib/api";
import { parsePastedTranscript } from "@/lib/captions/parse";
import { processVideo, runAnalysis } from "@/lib/video/pipeline";
import type { Focus } from "@/lib/ai/clipper";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refetch") }),
  z.object({
    action: z.literal("paste"),
    transcript: z.string().trim().min(50, "Paste at least a few sentences of transcript").max(1_500_000),
    analyze: z.boolean().optional(),
  }),
]);

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiSubscriber();
  const { id } = await params;
  const video = await db.video.findFirst({ where: { id, userId: user.id } });
  if (!video) throw new HttpError(404, "Video not found.");
  const body = await parseBody(req, Body);

  if (body.action === "refetch") {
    await db.video.update({ where: { id }, data: { captionStatus: "pending", captionNote: "Fetching captions…" } });
    after(() => processVideo(id).catch((e) => console.error("[captions] refetch failed", e)));
    return json({ ok: true });
  }

  const { segments, timed } = parsePastedTranscript(body.transcript, video.durationSec);
  if (segments.length < 3) throw new HttpError(400, "We couldn't read enough text from that transcript.");
  const last = segments[segments.length - 1];
  if (timed && video.durationSec && last.start > video.durationSec + 5)
    throw new HttpError(400, "Those timestamps run past the end of the video. Is this the right transcript?");

  await db.video.update({
    where: { id },
    data: {
      captionStatus: "ready",
      captionSource: timed ? "paste:timed" : "paste:plain",
      captionTiming: timed ? "exact" : "estimated",
      captionLanguage: null,
      captionNote: timed
        ? "Pasted transcript with timestamps. Clip timings follow your timestamps."
        : "Pasted transcript without timestamps. Placement is estimated from word count, so check in/out points in the editor.",
      transcriptJson: JSON.stringify(segments),
    },
  });
  if (body.analyze !== false) {
    await db.video.update({ where: { id }, data: { analysisStatus: "running", analysisError: null } });
    after(() => runAnalysis(id, video.analysisFocus as Focus).catch((e) => console.error("[captions] analysis failed", e)));
  }
  return json({ ok: true, segments: segments.length, timed });
});
