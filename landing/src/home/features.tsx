import { SplitRise } from "../motion/split";
import { WaveCanvas } from "../site/wave-canvas";

/**
 * Features on an always-dark band: the 3D point field rolls under the headline, then the
 * features read as an index, one row each, like a studio's awards table.
 */

const FEATURES: [string, string, string][] = [
  ["AI moment finder", "Every moment gets a 0 to 100 score broken into hook, stand-alone clarity, payoff and quotability, with a plain-English reason.", "AI"],
  ["Frame-accurate editor", "Set in and out points to the frame on the timeline and preview the cut before you export.", "Editor"],
  ["Captions you can trust", "Creator tracks, auto-captions, translations, text tracks and an AI fetch agent, with exact or estimated timing on every clip.", "Captions"],
  ["Hooks and post copy", "A hook and a caption written for each network from what was actually said, ready to edit before you post.", "Copy"],
  ["Three networks, one queue", "YouTube Shorts, Instagram Reels and Facebook. Publish now or schedule; due posts go out every 15 minutes.", "Publish"],
  ["Numbers from the source", "Views, likes, comments and shares pulled live from each platform's own API, per network and per post.", "Analytics"],
];

export function Features() {
  return (
    <section id="features" className="dark-band relative isolate scroll-mt-0 overflow-hidden bg-[#07080c] text-white">
      <div className="relative h-[86svh] min-h-[560px]">
        <WaveCanvas variant="dark" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07080c]" aria-hidden="true" />
        <div className="relative mx-auto flex h-full max-w-[1400px] flex-col justify-center px-4 sm:px-8">
          <p className="hud text-white/60">
            <span className="text-signal">/</span> Features
          </p>
          <SplitRise
            as="h2"
            className="display mt-5 text-[clamp(50px,9vw,151px)]"
            parts={["Post\neverywhere"]}
          />
          <p className="mt-8 max-w-xl text-[clamp(16px,1.44vw,19px)] leading-relaxed text-white/70">
            Everything between &ldquo;great stream&rdquo; and &ldquo;posted&rdquo;: precise about where a moment starts and ends, honest about how it
            knows, and quick to publish.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-28 sm:px-8 sm:pb-36">
        <div className="hud hidden grid-cols-[80px_1fr_1.3fr_120px] gap-6 border-b border-white/15 pb-4 text-white/45 lg:grid">
          <span>No.</span>
          <span>Feature</span>
          <span>What it does</span>
          <span className="text-right">Area</span>
        </div>
        <ul>
          {FEATURES.map(([title, body, tag], i) => (
            <li key={title} className="feature-row group grid gap-3 border-b border-white/15 py-7 lg:grid-cols-[80px_1fr_1.3fr_120px] lg:items-baseline lg:gap-6">
              <span className="hud text-white/45">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-[clamp(23px,2.34vw,34px)] leading-[1.05] tracking-[-0.02em] transition-transform duration-500 group-hover:translate-x-3">
                {title}
              </h3>
              <p className="max-w-xl text-[16px] leading-relaxed text-white/65">{body}</p>
              <span className="hud text-signal lg:text-right">{tag}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
