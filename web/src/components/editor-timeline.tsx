import clsx from "clsx";
import { useCallback, useRef } from "react";
import { formatTimecode } from "@shortlark/shared/time";
import { STATUS_META } from "./badges";

export interface TLClip {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  status: string;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

function useTrackMath(ref: React.RefObject<HTMLDivElement | null>, from: number, to: number) {
  return useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return from;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(0, clientX - r.left), r.width);
      return from + (x / r.width) * (to - from);
    },
    [ref, from, to],
  );
}

/** Full-length overview: every clip of this video, colour-coded by status; click to seek. */
export function OverviewTrack({
  duration,
  clips,
  currentId,
  inSec,
  outSec,
  playhead,
  onSeek,
}: {
  duration: number;
  clips: TLClip[];
  currentId: string;
  inSec: number;
  outSec: number;
  playhead: number;
  onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const toTime = useTrackMath(ref, 0, duration);
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), duration) / duration) * 100}%`;
  return (
    <div>
      <div
        ref={ref}
        className="relative h-7 cursor-pointer rounded-md bg-surface-2"
        onPointerDown={(e) => onSeek(toTime(e.clientX))}
        role="slider"
        aria-label="Video overview"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(playhead)}
      >
        {clips
          .filter((c) => c.id !== currentId)
          .map((c) => (
            <div
              key={c.id}
              title={`${c.title} (${STATUS_META[c.status]?.label ?? c.status})`}
              className={clsx("absolute top-2 bottom-2 min-w-[2px] rounded-sm opacity-45", STATUS_META[c.status]?.bar ?? "bg-idea")}
              style={{ left: pct(c.startSec), width: `${((c.endSec - c.startSec) / duration) * 100}%` }}
            />
          ))}
        <div
          className="absolute top-0.5 bottom-0.5 min-w-[3px] rounded-sm bg-signal"
          style={{ left: pct(inSec), width: `${((outSec - inSec) / duration) * 100}%` }}
        />
        <div className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-text" style={{ left: pct(playhead) }} />
      </div>
      <div className="tc mt-1 flex justify-between text-[11px] text-faint">
        <span>0:00</span>
        <span>{formatTimecode(duration)}</span>
      </div>
    </div>
  );
}

/**
 * Zoomed track around the clip with draggable in/out handles and caption blocks,
 * so cuts can be placed on sentence boundaries.
 */
export function DetailTrack({
  duration,
  inSec,
  outSec,
  playhead,
  segments,
  onSeek,
  onChange,
}: {
  duration: number;
  inSec: number;
  outSec: number;
  playhead: number;
  segments: Segment[];
  onSeek: (t: number) => void;
  onChange: (inSec: number, outSec: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pad = Math.max(8, (outSec - inSec) * 0.35);
  const from = Math.max(0, inSec - pad);
  const to = Math.min(duration || outSec + pad, outSec + pad);
  const span = Math.max(1, to - from);
  const toTime = useTrackMath(ref, from, to);
  const pos = (t: number) => `${((t - from) / span) * 100}%`;
  const visible = segments.filter((s) => s.end > from && s.start < to);

  const drag = (which: "in" | "out") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const t = Math.round(toTime(ev.clientX) * 10) / 10;
      if (which === "in") onChange(Math.min(t, outSec - 1), outSec);
      else onChange(inSec, Math.max(t, inSec + 1));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const step = span > 240 ? 60 : span > 90 ? 15 : span > 40 ? 5 : 2;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);

  return (
    <div className="select-none">
      <div className="tc relative mb-1 h-4 text-[11px] text-faint">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>
            {formatTimecode(t)}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative h-20 cursor-pointer rounded-md bg-surface-2" onPointerDown={(e) => onSeek(toTime(e.clientX))}>
        {/* caption blocks */}
        {visible.map((s, i) => (
          <div
            key={`${s.start}-${i}`}
            title={`${formatTimecode(s.start)} ${s.text}`}
            className="absolute top-2 h-3 rounded-[2px] bg-line-strong hover:bg-muted"
            style={{ left: pos(Math.max(s.start, from)), width: `max(2px, calc(${((Math.min(s.end, to) - Math.max(s.start, from)) / span) * 100}% - 2px))` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSeek(s.start);
            }}
          />
        ))}
        {/* selected range */}
        <div className="absolute top-7 bottom-2 rounded-sm bg-signal/25 ring-1 ring-signal" style={{ left: pos(inSec), width: `${((outSec - inSec) / span) * 100}%` }} />
        {/* handles */}
        {(["in", "out"] as const).map((w) => (
          <div
            key={w}
            onPointerDown={drag(w)}
            className="group absolute top-5 bottom-0 z-10 flex w-4 -translate-x-1/2 cursor-ew-resize justify-center"
            style={{ left: pos(w === "in" ? inSec : outSec) }}
            role="slider"
            aria-label={w === "in" ? "In point" : "Out point"}
            aria-valuenow={w === "in" ? inSec : outSec}
          >
            <div className="h-full w-1 rounded-full bg-signal group-hover:w-1.5" />
            <span className="tc absolute -bottom-5 rounded bg-signal px-1 text-[10px] font-medium text-white">{w.toUpperCase()}</span>
          </div>
        ))}
        {/* playhead */}
        {playhead >= from && playhead <= to && (
          <div className="pointer-events-none absolute -top-1 -bottom-1 z-20 w-px bg-text" style={{ left: pos(playhead) }}>
            <div className="absolute -top-1 -left-[4px] size-[9px] rotate-45 bg-text" />
          </div>
        )}
      </div>
      <div className="h-5" />
    </div>
  );
}
