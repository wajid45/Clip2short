import clsx from "clsx";
import { Link } from "@/lib/nav";
import { formatTimecode } from "@shortlark/shared/time";
import { STATUS_META } from "./badges";

export interface TimelineClip {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  status: string;
  score: number | null;
}

/** Read-only overview of where every clip sits in the source video, colour-coded by status. */
export function MiniTimeline({ clips, duration }: { clips: TimelineClip[]; duration: number }) {
  if (!duration) return null;
  const ticks = Array.from({ length: 5 }, (_, i) => (duration / 4) * i);
  return (
    <div>
      <div className="relative h-9 rounded-md bg-surface-2">
        {clips.map((c) => (
          <Link
            key={c.id}
            href={`/app/clips/${c.id}`}
            title={`${c.title} · ${formatTimecode(c.startSec)}–${formatTimecode(c.endSec)}${c.score != null ? ` · score ${c.score}` : ""}`}
            className={clsx(
              "absolute top-1.5 bottom-1.5 min-w-[3px] rounded-sm opacity-80 transition-opacity hover:opacity-100",
              STATUS_META[c.status]?.bar ?? "bg-idea",
            )}
            style={{ left: `${(c.startSec / duration) * 100}%`, width: `${((c.endSec - c.startSec) / duration) * 100}%` }}
          />
        ))}
      </div>
      <div className="tc mt-1.5 flex justify-between text-[11px] text-faint">
        {ticks.map((t) => (
          <span key={t}>{formatTimecode(t)}</span>
        ))}
      </div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {Object.entries(STATUS_META).map(([k, m]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-2 rounded-sm", m.bar)} />
          {m.label}
        </span>
      ))}
    </div>
  );
}
