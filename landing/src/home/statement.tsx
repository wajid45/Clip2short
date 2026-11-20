import { TRIAL } from "@shortlark/shared/plans";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { SplitRise } from "../motion/split";

/** Facts about the product (not marketing numbers), run as a slow strip like a ticker. */
const FACTS: [string, string, string?][] = [
  ["0 to 100", "Moment score on every pick"],
  ["1 credit", "Per minute of video analysed"],
  ["YouTube", "Post Shorts from one queue", "youtube"],
  ["Instagram", "Post Reels from one queue", "instagram"],
  ["Facebook", "Post Reels from one queue", "facebook"],
  ["15 min", "Between scheduled posting slots"],
  ["9:16", "Vertical export for video files"],
  [`${TRIAL.credits} free`, "Credits to start, no card"],
];

export function Statement() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1400px] px-4 pt-28 pb-20 text-center sm:px-8 sm:pt-40">
        <p className="hud text-muted">
          <span className="text-signal">/</span> Why Shortlark
        </p>
        <SplitRise as="h2" className="display mt-6 text-[clamp(47px,8.55vw,137px)]" parts={["Find the\nmoments"]} />
        <p className="mx-auto mt-10 max-w-2xl text-[clamp(16px,1.44vw,19px)] leading-relaxed text-muted">
          A six-hour stream hides a dozen great clips. Scrubbing for them takes longer than the stream itself. Shortlark reads the whole thing, ranks
          every moment worth posting and tells you exactly why.
        </p>
        <a href="#how" className="ulink mt-10 inline-flex">
          See how it works <span aria-hidden="true">→</span>
        </a>
      </div>

      {/* Facts strip: number over a plain label, no dividers */}
      <div className="bg-surface-2/60" aria-label="Shortlark at a glance">
        <div className="marquee-mask overflow-hidden">
          <ul className="marquee-track flex w-max">
            {[...FACTS, ...FACTS].map(([big, small, network], i) => (
              <li
                key={i}
                className="flex min-w-[260px] shrink-0 flex-col justify-center gap-2 px-8 py-8 sm:min-w-[300px] sm:px-10"
                aria-hidden={i >= FACTS.length || undefined}
              >
                <span className="flex items-center gap-3 text-[clamp(34px,3.4vw,48px)] leading-none tracking-[-0.03em] whitespace-nowrap">
                  {network && <PlatformIcon platform={network} size={34} className="ring-0" />}
                  {big}
                </span>
                <span className="text-[15px] leading-snug text-muted">{small}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
