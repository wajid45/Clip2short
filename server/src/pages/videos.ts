import { requireSubscriber } from "@server/lib/auth";
import { db } from "@server/lib/db";
import { aiConfigured } from "@server/lib/ai/anthropic";
import { getSegments } from "@server/lib/video/pipeline";
import { getCredits } from "@server/lib/credits";
import { HttpError } from "@server/lib/api";
import { analysisCost } from "@shortlark/shared/plans";

export async function loadVideos() {
  const user = await requireSubscriber();
  const videos = await db.video.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      author: true,
      platform: true,
      durationSec: true,
      thumbnailUrl: true,
      createdAt: true,
      captionStatus: true,
      analysisStatus: true,
      analysisError: true,
      _count: { select: { clips: true } },
      clips: { orderBy: { score: { sort: "desc", nulls: "last" } }, take: 1, select: { score: true } },
    },
  });
  return { videos, aiConfigured: aiConfigured() };
}

export async function loadVideo(id: string) {
  const user = await requireSubscriber();
  const video = await db.video.findFirst({
    where: { id, userId: user.id },
    include: { clips: { orderBy: [{ score: { sort: "desc", nulls: "last" } }, { startSec: "asc" }] } },
  });
  if (!video) throw new HttpError(404, "Video not found.");
  const segments = getSegments(video);
  const duration = video.durationSec ?? Math.max(0, ...video.clips.map((c) => c.endSec), segments.at(-1)?.end ?? 0);
  const cost = analysisCost(duration || 60, video.analysisCount > 0);
  const balance = (await getCredits(user.id)).total;
  // The full transcript can be large; this page only needs the segment count.
  const { transcriptJson, ...rest } = video;
  void transcriptJson;
  return { video: rest, segmentCount: segments.length, duration, cost, balance, aiConfigured: aiConfigured() };
}
