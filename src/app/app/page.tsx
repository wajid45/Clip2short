import Link from "next/link";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/time";
import { ImportBox } from "@/components/import-box";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { Thumb } from "@/components/thumb";
import { PLATFORM_LABEL, ScoreBadge } from "@/components/badges";
import { aiConfigured } from "@/lib/ai/anthropic";

export const metadata: Metadata = { title: "Videos" };

function pipelineLabel(v: { captionStatus: string; analysisStatus: string; analysisError: string | null }) {
  if (v.captionStatus === "pending") return { text: "Reading captions…", cls: "text-signal" };
  if (v.captionStatus === "missing" || v.captionStatus === "failed") return { text: "Needs a transcript", cls: "text-draft" };
  if (v.analysisStatus === "running") return { text: "Finding moments…", cls: "text-signal" };
  if (v.analysisStatus === "failed") return { text: "Analysis failed", cls: "text-danger" };
  return null;
}

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireSubscriber();
  const { welcome } = await searchParams;
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

  return (
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
      {!aiConfigured() && (
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
  );
}
