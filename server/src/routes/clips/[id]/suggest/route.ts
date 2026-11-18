import { db } from "@server/lib/db";
import { apiSubscriber, handle, HttpError, json } from "@server/lib/api";
import { aiConfigured, describeAiError } from "@server/lib/ai/anthropic";
import { suggestCopy } from "@server/lib/ai/suggest";
import { InsufficientCredits, refundCredits, spendCredits } from "@server/lib/credits";
import { rateLimit } from "@server/lib/ratelimit";

const SUGGEST_COST = 1;

type Ctx = { params: Promise<{ id: string }> };

/** Generates AI posting copy for a clip (1 credit, refunded if it fails). Nothing is applied until the user approves. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiSubscriber();
  const { id } = await params;
  const clip = await db.clip.findFirst({ where: { id, userId: user.id }, include: { video: true } });
  if (!clip) throw new HttpError(404, "Clip not found.");
  if (!aiConfigured()) throw new HttpError(503, "AI suggestions aren't configured on this server (missing ANTHROPIC_API_KEY).");
  await rateLimit(`suggest:${user.id}`, 30, 60 * 60e3);

  let spendId: string;
  try {
    spendId = await spendCredits(user.id, SUGGEST_COST, `AI posting copy for “${clip.title.slice(0, 80)}”`, clip.videoId);
  } catch (e) {
    if (e instanceof InsufficientCredits) throw new HttpError(402, "You need 1 credit for AI suggestions. Buy credits in Billing.", "no_credits");
    throw e;
  }
  try {
    const suggestion = await suggestCopy({
      videoTitle: clip.video.title,
      videoDescription: clip.video.description,
      author: clip.video.author,
      clipTitle: clip.title,
      transcript: clip.transcript,
      durationSec: clip.endSec - clip.startSec,
      currentHook: clip.hook,
      currentCaption: clip.caption,
    });
    const stored = { ...suggestion, createdAt: new Date().toISOString() };
    await db.clip.update({ where: { id }, data: { suggestionsJson: JSON.stringify(stored) } });
    return json({ suggestion: stored });
  } catch (e) {
    await refundCredits(spendId, `Refund: AI posting copy for “${clip.title.slice(0, 80)}” failed`);
    throw new HttpError(502, `${describeAiError(e)} Your credit was refunded.`);
  }
});
