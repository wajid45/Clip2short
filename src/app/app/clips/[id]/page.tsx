import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSegments } from "@/lib/video/pipeline";
import { ClipEditor } from "@/components/clip-editor";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await db.clip.findUnique({ where: { id }, select: { title: true } });
  return { title: c?.title ?? "Clip" };
}

export default async function ClipPage({ params }: Props) {
  const user = await requireSubscriber();
  const { id } = await params;
  const clip = await db.clip.findFirst({ where: { id, userId: user.id }, include: { video: true } });
  if (!clip) notFound();

  const [siblings, accounts, posts] = await Promise.all([
    db.clip.findMany({
      where: { videoId: clip.videoId },
      select: { id: true, title: true, startSec: true, endSec: true, status: true },
    }),
    db.socialAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ platform: "asc" }, { displayName: "asc" }],
      select: { id: true, platform: true, displayName: true, username: true, status: true },
    }),
    db.post.findMany({ where: { clipId: clip.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const v = clip.video;
  return (
    <ClipEditor
      clip={{
        id: clip.id,
        title: clip.title,
        startSec: clip.startSec,
        endSec: clip.endSec,
        status: clip.status,
        category: clip.category,
        hook: clip.hook,
        caption: clip.caption,
        hashtags: clip.hashtags,
        notes: clip.notes,
        transcript: clip.transcript,
        score: clip.score,
        scoreHook: clip.scoreHook,
        scoreSelf: clip.scoreSelf,
        scorePayoff: clip.scorePayoff,
        scoreQuote: clip.scoreQuote,
        reason: clip.reason,
        origin: clip.origin,
      }}
      video={{
        id: v.id,
        title: v.title,
        platform: v.platform,
        externalId: v.externalId,
        sourceUrl: v.sourceUrl,
        durationSec: v.durationSec,
        captionTiming: v.captionTiming,
      }}
      siblings={siblings}
      segments={getSegments(v)}
      suggestion={clip.suggestionsJson ? JSON.parse(clip.suggestionsJson) : null}
      canDownload={v.platform === "direct"}
      accounts={accounts}
      posts={posts.map((p) => ({
        id: p.id,
        platform: p.platform,
        accountName: p.accountName,
        status: p.status,
        text: p.text,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        liveUrl: p.liveUrl,
        error: p.error,
      }))}
    />
  );
}
