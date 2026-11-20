import { MOMENTS, StreamScanner } from "@/components/landing/stream-scanner";
import { ShortCard } from "@/components/landing/short-card";
import { useScrollProgress } from "../motion/frame";

/**
 * The product reel: a framed card that starts inset with rounded corners and opens to the full
 * width of the screen as you scroll, while the live scan plays inside it and a finished Short
 * slides in beside it. On phones it is a plain card.
 */
export function Showcase() {
  const ref = useScrollProgress<HTMLElement>((p, el) => {
    // Open fully over the first 55% of the section, then hold.
    const o = Math.min(1, p / 0.55);
    const e = 1 - Math.pow(1 - o, 3);
    el.style.setProperty("--open", e.toFixed(4));
    el.style.setProperty("--p", p.toFixed(4));
  });

  return (
    <section id="reel" ref={ref} className="showcase relative scroll-mt-0 md:h-[190vh]" aria-label="Shortlark scanning a stream">
      <div className="md:sticky md:top-0 md:flex md:h-[100svh] md:items-center md:justify-center md:overflow-hidden">
        <div className="showcase-card relative mx-4 overflow-hidden bg-[#07080c] text-white md:mx-0">
          <div className="showcase-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative flex h-full flex-col px-5 py-6 sm:px-10 sm:py-10">
            <div className="hud flex items-center justify-between text-white/60">
              <span>
                <span className="text-signal">/</span> Live analysis
              </span>
              <span className="text-gold">{MOMENTS.length} moments found</span>
            </div>
            <div className="grid flex-1 items-center gap-8 pt-6 lg:grid-cols-[1fr_260px] lg:gap-12">
              <div className="showcase-scan">
                <StreamScanner />
              </div>
              <div className="showcase-short mx-auto hidden w-[230px] lg:block">
                <ShortCard
                  palette="arena"
                  handle="lateshiftclips"
                  caption={["one", "shot.", "ZERO", "hesitation"]}
                  hot={2}
                  score={94}
                  time="0:41"
                  likes="132K"
                  comments="3.4K"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
