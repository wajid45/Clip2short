import clsx from "clsx";

/**
 * A vertical "Short" as it would appear on a phone, built from CSS (no stock art):
 * a stylised night-city scene, karaoke-style captions, an action rail and a progress bar.
 */
export interface ShortCardProps {
  palette: "sunset" | "neon" | "dawn" | "arena" | "toxic";
  handle: string;
  caption: string[]; // caption words; the `hot` index is highlighted
  hot: number;
  score: number;
  time: string;
  likes: string;
  comments: string;
  className?: string;
  progressDelay?: string;
}

const PALETTES = {
  sunset: { sky: "from-[#2a0f3d] via-[#c2275a] to-[#ff9a3c]", sun: "bg-[#ffd36b]", city: "#170a23" },
  neon: { sky: "from-[#05121f] via-[#0b3a5c] to-[#19c3c9]", sun: "bg-[#ff4fa3]", city: "#040b14" },
  dawn: { sky: "from-[#1d1240] via-[#6a3ee8] to-[#ff7ab8]", sun: "bg-[#ffe7a8]", city: "#120a2a" },
  // Esports looks for the hero.
  arena: { sky: "from-[#060a24] via-[#1f3fbf] to-[#4a72e6]", sun: "bg-[#2ad4d1]", city: "#03061a" },
  toxic: { sky: "from-[#04120b] via-[#0f5c37] to-[#3ddc84]", sun: "bg-[#e8ff5a]", city: "#020a06" },
};

const BUILDINGS = [38, 62, 46, 80, 54, 30, 70, 44, 58, 36, 66, 40];

export function ShortCard({ palette, handle, caption, hot, score, time, likes, comments, className, progressDelay = "0s" }: ShortCardProps) {
  const p = PALETTES[palette];
  return (
    <div
      className={clsx(
        "relative aspect-[9/16] w-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_40px_90px_-30px_rgba(0,0,0,0.65)]",
        className,
      )}
    >
      {/* scene */}
      <div className={clsx("absolute inset-0 bg-gradient-to-b", p.sky)} />
      <div className={clsx("absolute top-[28%] left-1/2 aspect-square w-[46%] -translate-x-1/2 rounded-full opacity-90 blur-[1px]", p.sun)} />
      <div className="absolute inset-x-0 bottom-0 flex h-[46%] items-end gap-[3%] px-[4%]">
        {BUILDINGS.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${h}%`, background: p.city }}>
            <div className="mx-auto mt-[20%] grid w-[60%] grid-cols-2 gap-[3px] opacity-60">
              {Array.from({ length: Math.round(h / 14) }).map((_, j) => (
                <span key={j} className={clsx("h-[3px] rounded-[1px]", (i + j) % 3 ? "bg-[#ffd36b]/50" : "bg-transparent")} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-[6%] text-[10px] font-medium text-white/90">
        <span className="rounded-full bg-black/35 px-2 py-0.5 backdrop-blur">Short · {time}</span>
        <span className="tc rounded-md bg-[#3fb27f] px-1.5 py-0.5 text-[10px] font-semibold text-white">{score}</span>
      </div>

      {/* karaoke caption */}
      <div className="absolute top-[40%] right-[20%] left-[8%] text-center text-[clamp(10px,1.08vw,14px)] leading-tight font-extrabold tracking-tight text-white uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]">
        {caption.map((w, i) => (
          <span key={i} className={clsx(i === hot && "text-[#ffd84d]")}>
            {w}{" "}
          </span>
        ))}
      </div>

      {/* action rail */}
      <div className="absolute right-[5%] bottom-[18%] flex flex-col items-center gap-3 text-[9px] font-medium text-white">
        {[
          { d: "M10 17s-6-3.8-6-8.2A3.4 3.4 0 0 1 10 6.6a3.4 3.4 0 0 1 6 2.2C16 13.2 10 17 10 17z", n: likes, fill: true },
          { d: "M4 5.5h12v8H8l-4 3z", n: comments },
          { d: "M11 4l6 5.5-6 5.5v-3.2C7 11.8 4.7 13 3 16c.4-4.6 3-7.6 8-8z", n: "Share" },
        ].map((a, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-black/35 backdrop-blur">
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <path d={a.d} fill={a.fill ? "#ff4f6d" : "none"} stroke="#fff" strokeWidth={a.fill ? 0 : 1.6} strokeLinejoin="round" />
              </svg>
            </span>
            {a.n}
          </span>
        ))}
      </div>

      {/* footer */}
      <div className="absolute inset-x-[6%] bottom-[6%] text-white">
        <p className="text-[11px] font-semibold">@{handle}</p>
        <p className="mt-0.5 line-clamp-1 text-[10px] text-white/75">clipped with clip2short</p>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/25">
          <div className="h-full origin-left animate-progress rounded-full bg-white" style={{ animationDelay: progressDelay }} />
        </div>
      </div>
    </div>
  );
}
