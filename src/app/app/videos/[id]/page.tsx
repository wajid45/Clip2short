import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/time";
import { getSegments } from "@/lib/video/pipeline";
import { aiConfigured } from "@/lib/ai/anthropic";
import { analysisCost } from "@/lib/plans";
import { getCredits } from "@/lib/credits";
import { Card, EmptyState, Notice, Spinner } from "@/components/ui";
import { Thumb } from "@/components/thumb";
import { PLATFORM_LABEL } from "@/components/badges";
import { CaptionPanel } from "@/components/caption-panel";
import { VideoPoller } from "@/components/video-poller";
import { AnalyzeButton, DeleteVideoButton, NewClipButton } from "@/components/video-actions";
import { MiniTimeline, StatusLegend } from "@/components/mini-timeline";
import { MomentRow } from "@/components/moment-row";
import { IconArrowLeft, IconExternal } from "@/components/icons";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = await db.video.findUnique({ where: { id }, select: { title: true } });
  return { title: v?.title ?? "Video" };
}

export default async function VideoPage({ params }: Props) {
  const user = await requireSubscriber();
  const { id } = await params;
  const video = await db.video.findFirst({
    where: { id, userId: user.id },
    include: { clips: { orderBy: [{ score: { sort: "desc", nulls: "last" } }, { startSec: "asc" }] } },
  });
  if (!video) notFound();

  const segments = getSegments(video);
  const busy = video.captionStatus === "pending" || video.analysisStatus === "running";
  const signature = `${video.captionStatus}|${video.analysisStatus}|${video.clips.length}`;
  const duration = video.durationSec ?? Math.max(0, ...video.clips.map((c) => c.endSec), segments.at(-1)?.end ?? 0);
  const cost = analysisCost(duration || 60, video.analysisCount > 0);
  const balance = (await getCredits(user.id)).total;

  return (
    <>
      <VideoPoller id={video.id} active={busy} signature={signature} />
      <Link href="/app" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <IconArrowLeft size={15} /> Videos
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-5 sm:flex-row">
            <Thumb src={video.thumbnailUrl} alt="" className="w-full shrink-0 sm:w-56" />
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight">{video.title}</h1>
              <p className="mt-2 text-sm text-muted">
                {PLATFORM_LABEL[video.platform]}
                {video.author ? ` · ${video.author}` : ""} · <span className="tc">{formatDuration(video.durationSec)}</span>
              </p>
              <a
                href={video.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
              >
                Open original <IconExternal size={14} />
              </a>
            </div>
          </div>

          {video.summary && <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted">{video.summary}</p>}

          <section className="mt-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Moments <span className="tc text-base font-normal text-faint">{video.clips.length}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <NewClipButton videoId={video.id} duration={video.durationSec} />
                {video.captionStatus === "ready" && aiConfigured() && (
                  <AnalyzeButton
                    videoId={video.id}
                    label={`${video.analysisCount > 0 ? "Find moments again" : "Find moments"} · ${cost} credit${cost === 1 ? "" : "s"}`}
                    disabled={video.analysisStatus === "running" || balance < cost}
                    initialFocus={video.analysisFocus}
                  />
                )}
              </div>
            </div>

            {duration > 0 && video.clips.length > 0 && (
              <div className="mb-6 space-y-2.5">
                <MiniTimeline clips={video.clips} duration={duration} />
                <StatusLegend />
              </div>
            )}

            {video.captionStatus === "ready" && video.analysisStatus !== "running" && balance < cost && (
              <div className="mb-4">
                <Notice tone="warn">
                  This needs {cost} credits and you have {balance}.{" "}
                  <Link href="/app/billing" className="font-medium underline underline-offset-4">
                    Buy credits
                  </Link>
                </Notice>
              </div>
            )}
            {video.analysisStatus === "running" && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
                <Spinner className="text-signal" />
                AI is reading the full transcript and scoring every candidate moment. Long videos take a minute or two.
              </div>
            )}
            {video.analysisStatus === "failed" && video.analysisError && (
              <div className="mb-4">
                <Notice tone="error">{video.analysisError}</Notice>
              </div>
            )}
            {video.analysisStatus === "done" && video.analysisError && (
              <div className="mb-4">
                <Notice tone="warn">{video.analysisError}</Notice>
              </div>
            )}

            {video.clips.length > 0 ? (
              <div className="-mx-3 sm:-mx-4">
                {video.clips.map((c, i) => (
                  <MomentRow key={c.id} clip={c} rank={c.score != null ? i + 1 : undefined} />
                ))}
              </div>
            ) : (
              !busy && (
                <EmptyState
                  title={video.captionStatus === "ready" ? "No moments yet" : "Waiting for captions"}
                  body={
                    video.captionStatus === "ready"
                      ? "Run the AI to find moments, or create a clip by hand."
                      : "AI needs the transcript to find moments. Fetch captions again or paste a transcript."
                  }
                />
              )
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <CaptionPanel
              videoId={video.id}
              info={{
                status: video.captionStatus,
                source: video.captionSource,
                timing: video.captionTiming,
                note: video.captionNote,
                segmentCount: segments.length,
              }}
            />
          </Card>
          {video.description && (
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-medium">Description</h3>
              <p className="scroll-thin max-h-56 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-line text-muted">
                {video.description}
              </p>
            </Card>
          )}
          <div className="flex justify-end">
            <DeleteVideoButton videoId={video.id} />
          </div>
        </aside>
      </div>
    </>
  );
}
