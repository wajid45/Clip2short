import { ShortCard, type ShortCardProps } from "./short-card";

/** Tilted wall of Shorts scrolling in opposite directions: the backdrop for the final call to action. */

type Card = Omit<ShortCardProps, "className">;

const CARDS: Card[] = [
  { palette: "sunset", handle: "lateshiftclips", caption: ["one", "shot.", "ZERO", "hesitation"], hot: 2, score: 94, time: "0:41", likes: "132K", comments: "3.4K" },
  { palette: "neon", handle: "clutchcuts", caption: ["chat", "called", "it", "FIRST"], hot: 3, score: 86, time: "0:37", likes: "39K", comments: "980" },
  { palette: "dawn", handle: "marathonmoments", caption: ["wait", "for", "IT"], hot: 2, score: 90, time: "0:28", likes: "77K", comments: "2.0K" },
  { palette: "neon", handle: "pixelheistclips", caption: ["the", "chat", "went", "INSANE"], hot: 3, score: 81, time: "0:52", likes: "21K", comments: "640" },
  { palette: "sunset", handle: "nightshiftclips", caption: ["he", "did", "NOT", "see", "that"], hot: 2, score: 88, time: "0:33", likes: "48K", comments: "1.1K" },
  { palette: "dawn", handle: "speedrunsnips", caption: ["new", "WORLD", "record?"], hot: 1, score: 84, time: "0:45", likes: "56K", comments: "1.4K" },
];

function Column({ cards, dir, offset }: { cards: Card[]; dir: "up" | "down"; offset: string }) {
  // Two copies so the loop is seamless at -50%.
  const list = [...cards, ...cards];
  return (
    <div className="w-[150px] shrink-0 sm:w-[180px]" style={{ marginTop: offset }}>
      <div className={dir === "up" ? "flex animate-wall-up flex-col gap-5" : "flex animate-wall-down flex-col gap-5"}>
        {list.map((c, i) => (
          <ShortCard key={i} {...c} progressDelay={`-${i}s`} />
        ))}
      </div>
    </div>
  );
}

export function ShortsWall() {
  const rot = (n: number) => [...CARDS.slice(n), ...CARDS.slice(0, n)];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="stage-3d absolute inset-0 opacity-60">
        <div
          className="preserve-3d absolute top-1/2 left-1/2 flex gap-5"
          style={{ transform: "translate(-50%, -50%) rotateX(28deg) rotateZ(-14deg) scale(1.05)" }}
        >
          <Column cards={rot(0)} dir="up" offset="0px" />
          <Column cards={rot(2)} dir="down" offset="-120px" />
          <Column cards={rot(4)} dir="up" offset="-60px" />
          <Column cards={rot(1)} dir="down" offset="-180px" />
          <Column cards={rot(3)} dir="up" offset="-30px" />
          <Column cards={rot(5)} dir="down" offset="-150px" />
          <Column cards={rot(2)} dir="up" offset="-90px" />
        </div>
      </div>
      {/* fade the wall into the band so the headline stays readable */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_58%_at_center,var(--color-inverse)_45%,transparent_100%)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-inverse to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-inverse to-transparent" />
    </div>
  );
}
