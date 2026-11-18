import { after } from "@server/http/after";
import { db } from "@server/lib/db";
import { apiSubscriber, handle, HttpError, json } from "@server/lib/api";
import { runAnalysis } from "@server/lib/video/pipeline";
import { aiConfigured } from "@server/lib/ai/anthropic";
import { analysisCost } from "@shortlark/shared/plans";
import { getCredits } from "@server/lib/credits";
import { getSegments } from "@server/lib/video/pipeline";
import { FOCUSES, type Focus } from "@server/lib/ai/clipper";


type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiSubscriber();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { focus?: string };
  const focus: Focus = body.focus && body.focus in FOCUSES ? (body.focus as Focus) : "auto";
  const video = await db.video.findFirst({ where: { id, userId: user.id } });
  if (!video) throw new HttpError(404, "Video not found.");
  if (!aiConfigured()) throw new HttpError(503, "AI analysis isn't configured on this server.");
  if (video.captionStatus !== "ready") throw new HttpError(409, "Add captions first: refetch them or paste a transcript.");
  const cost = analysisCost(video.durationSec ?? getSegments(video).at(-1)?.end ?? 60, video.analysisCount > 0);
  const balance = (await getCredits(user.id)).total;
  if (balance < cost) throw new HttpError(402, `This needs ${cost} credits and you have ${balance}. Buy credits or upgrade in Billing.`, "no_credits");
  // Atomic claim so double clicks don't start two analyses.
  const claimed = await db.video.updateMany({
    where: { id, analysisStatus: { not: "running" } },
    data: { analysisStatus: "running", analysisError: null, analysisFocus: focus },
  });
  if (!claimed.count) throw new HttpError(409, "Analysis is already running.");
  after(() => runAnalysis(id, focus).catch((e) => console.error("[analyze] failed", e)));
  return json({ ok: true });
});
