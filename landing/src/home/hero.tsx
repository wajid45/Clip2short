import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../motion/frame";
import { SplitRise } from "../motion/split";
import { WaveCanvas } from "../site/wave-canvas";
import { HeroImport } from "../site/hero-import";

const VERBS = ["finds", "scores", "trims", "captions", "posts"];

/**
 * The rotating verb. The slot eases to the width of the word on show (measured from hidden
 * copies), so short words don't leave a gap before the rest of the sentence.
 */
function CycleWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const measure = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = measure.current;
    if (!el) return;
    const read = () => setWidths([...el.children].map((c) => (c as HTMLElement).getBoundingClientRect().width));
    read();
    document.fonts?.ready.then(read);
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), 2400);
    return () => clearInterval(id);
  }, [words.length]);

  return (
    <span className="cycle-word text-text" aria-hidden="true" style={widths[i] ? { width: widths[i] } : undefined}>
      <span key={i} className="cycle-word-in italic">
        {words[i]}
      </span>
      <span ref={measure} className="cycle-word-measure italic">
        {words.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </span>
    </span>
  );
}

export function Hero() {
  return (
    <section className="hero relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <WaveCanvas variant="hero" className="-z-10" />
      {/* Soft fade so the type always sits on a calm background. */}
      <div className="hero-veil pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <div className="relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center justify-center px-4 pt-[96px] pb-14 text-center sm:px-8">
        <SplitRise
          as="h1"
          className="display hero-title text-[clamp(40px,8.6vw,140px)]"
          delay={0}
          stagger={22}
          parts={["Six hour streams\n", { text: "Forty second", className: "text-sunset font-display italic" }, " hits"]}
        />

        <p className="mt-8 flex flex-wrap items-baseline justify-center gap-x-[0.3em] text-[clamp(17px,1.8vw,22px)] leading-snug text-muted">
          <span className="sr-only">Shortlark finds, scores, trims, captions and posts the best moments of your long videos.</span>
          <span aria-hidden="true">AI that</span>
          <CycleWord words={VERBS} />
          <span aria-hidden="true">the moments worth posting.</span>
        </p>

        <div className="hero-rise mt-10 w-full max-w-[600px] text-left">
          <HeroImport />
        </div>
      </div>
    </section>
  );
}
