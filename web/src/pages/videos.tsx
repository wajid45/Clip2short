import { useParams } from "react-router";
import type { VideoData, VideosData } from "@server/page-routes";
import { formatDuration } from "@shortlark/shared/time";
import { IconArrowLeft, IconExternal } from "@shortlark/shared/components/icons";
import { Link, useSearchParams } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { ImportBox } from "@/components/import-box";
import { Card, EmptyState, Notice, PageHeader, Spinner } from "@/components/ui";
import { Thumb } from "@/components/thumb";
import { PLATFORM_LABEL, ScoreBadge } from "@/components/badges";
import { CaptionPanel } from "@/components/caption-panel";
import { VideoPoller } from "@/components/video-poller";
import { AnalyzeButton, DeleteVideoButton, NewClipButton } from "@/components/video-actions";
import { MiniTimeline, StatusLegend } from "@/components/mini-timeline";
import { MomentRow } from "@/components/moment-row";

function pipelineLabel(v: { captionStatus: string; analysisStatus: string; analysisError: string | null }) {
  if (v.captionStatus === "pending") return { text: "Reading captions…", cls: "text-signal" };
  if (v.captionStatus === "missing" || v.captionStatus === "failed") return { text: "Needs a transcript", cls: "text-draft" };
  if (v.analysisStatus === "running") return { text: "Finding moments…", cls: "text-signal" };
  if (v.analysisStatus === "failed") return { text: "Analysis failed", cls: "text-danger" };
  return null;
}

export function VideosPage() {
  const welcome = useSearchParams().has("welcome");
  return (
    <PageData<VideosData> path="/videos" title="Videos">
      {({ videos, aiConfigured }) => (
        <>
          <PageHeader
            title="Videos"
            description="Paste a link to a long video. Shortlark reads the captions, finds the moments worth clipping and scores them."
          />
          {welcome && (
            <div className="mb-6">
              <Notice tone="success">You&apos;re in. Your free credits are ready: paste your first video link below.</Notice>
            </div>
          )}
          {!aiConfigured && (
            <div className="mb-6">
              <Notice tone="warn">AI analysis is off because ANTHROPIC_API_KEY isn&apos;t set. Imports and captions still work.</Notice>
            </div>
          )}
          <div className="mb-12">
            <ImportBox />
          </div>

          {videos.length === 0 ? (
            <EmptyState
              title="No videos yet"
              body="Podcasts, interviews, talks, streams and webinars work best: anything with people talking for 10 minutes or more."
            />
          ) : (
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {videos.map((v) => {
                const state = pipelineLabel(v);
                return (
                  <Link key={v.id} href={`/app/videos/${v.id}`} className="group">
                    <div className="relative">
                      <Thumb src={v.thumbnailUrl} alt="" className="transition-opacity group-hover:opacity-90" />
                      <span className="tc absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">
                        {formatDuration(v.durationSec)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-[15px] leading-snug font-medium text-text group-hover:text-signal">{v.title}</h2>
                        <p className="mt-1 text-[13px] text-muted">
                          {PLATFORM_LABEL[v.platform]}
                          {v.author ? ` · ${v.author}` : ""}
                        </p>
                        <p className={`mt-1 text-[13px] ${state?.cls ?? "text-faint"}`}>
                          {state?.text ?? `${v._count.clips} ${v._count.clips === 1 ? "moment" : "moments"}`}
                        </p>
                      </div>
                      {v.clips[0]?.score != null && <ScoreBadge score={v.clips[0].score} size="sm" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageData>
  );
}

export function VideoPage() {
  const { id = "" } = useParams();
  return (
    <PageData<VideoData> key={id} path={`/videos/${encodeURIComponent(id)}`} title={(d) => d.video.title}>
      {({ video, segmentCount, duration, cost, balance, aiConfigured }) => {
        const busy = video.captionStatus === "pending" || video.analysisStatus === "running";
        const signature = `${video.captionStatus}|${video.analysisStatus}|${video.clips.length}`;
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
                    <a href={video.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
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
                      {video.captionStatus === "ready" && aiConfigured && (
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
                      segmentCount,
                    }}
                  />
                </Card>
                {video.description && (
                  <Card className="p-5">
                    <h3 className="mb-2 text-sm font-medium">Description</h3>
                    <p className="scroll-thin max-h-56 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-line text-muted">{video.description}</p>
                  </Card>
                )}
                <div className="flex justify-end">
                  <DeleteVideoButton videoId={video.id} />
                </div>
              </aside>
            </div>
          </>
        );
      }}
    </PageData>
  );
}
