import { Link } from "@/lib/nav";
import { formatTimecode, formatDuration } from "@shortlark/shared/time";
import { CategoryTag, ScoreBadge, StatusBadge } from "./badges";
import { Thumb } from "./thumb";

export interface MomentClip {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  status: string;
  score: number | null;
  category: string | null;
  reason: string | null;
  hook: string;
  video?: { id: string; title: string; thumbnailUrl: string | null };
}

/** A scored moment with the AI's reasoning, used on the video page and the best-moments feed. */
export function MomentRow({ clip, rank, showVideo }: { clip: MomentClip; rank?: number; showVideo?: boolean }) {
  return (
    <Link
      href={`/app/clips/${clip.id}`}
      className="group grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-transparent p-3 transition-colors hover:border-line hover:bg-surface sm:grid-cols-[auto_auto_1fr] sm:p-4"
    >
      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <ScoreBadge score={clip.score} size="lg" />
        {rank != null && <span className="tc text-[11px] text-faint">#{rank}</span>}
      </div>
      {showVideo && clip.video && <Thumb src={clip.video.thumbnailUrl} alt="" className="hidden w-36 sm:block" />}
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-medium text-text group-hover:text-signal">{clip.title}</h3>
          <StatusBadge status={clip.status} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span className="tc text-signal">
            {formatTimecode(clip.startSec)} → {formatTimecode(clip.endSec)}
          </span>
          <span className="text-faint">·</span>
          <span>{formatDuration(clip.endSec - clip.startSec)}</span>
          {showVideo && clip.video && (
            <>
              <span className="text-faint">·</span>
              <span className="truncate">{clip.video.title}</span>
            </>
          )}
        </p>
        {clip.hook && <p className="mt-2 text-sm text-text/90">&ldquo;{clip.hook}&rdquo;</p>}
        {clip.reason && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            <span className="text-faint">Why AI picked it: </span>
            {clip.reason}
          </p>
        )}
        <div className="mt-2.5">
          <CategoryTag category={clip.category} />
        </div>
      </div>
    </Link>
  );
}
