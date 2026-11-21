import { SplitRise } from "../motion/split";
import { WaveBand } from "./wave-band";

/**
 * Who it is for, on a full light-blue block below the waving tape.  Each audience is one large line.
 */

const CASES: { title: string; body: string; points: string[] }[] = [
  {
    title: "Streamers and clippers",
    body: "Drop a six-hour stream and get a ranked shortlist of the plays, fails and reactions worth posting while the stream is still trending.",
    points: ["Main events focus for gameplay", "Clip what chat reacted to", "Post the best moment first"],
  },
  {
    title: "Podcasters",
    body: "Find the lines people will repeat. Every pick comes with a hook, a caption and the reason it was chosen.",
    points: ["Insights and funniest focuses", "Hooks taken from the transcript", "Captions ready for each network"],
  },
  {
    title: "Agencies and editors",
    body: "Connect up to 40 accounts, schedule a week of posts in an afternoon and see what performed across every channel.",
    points: ["Bulk edit and CSV export", "Scheduling every 15 minutes", "Analytics per platform"],
  },
];

export function UseCases() {


  return (
    <section id="use-cases" className="relative scroll-mt-0">
      <div className="relative z-10 -mb-[9vw] pointer-events-none">
        <WaveBand id="cases" tone="gold" />
      </div>
      <div className="use-block relative pt-[16vw] pb-28 text-[#10204a] sm:pb-36">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <p className="hud text-[#10204a]/70">
            <span className="text-signal">/</span> Built for
          </p>
          <SplitRise as="h2" className="display mt-4 max-w-4xl text-[clamp(40px,5.4vw,83px)]" parts={["People who live in long video"]} />

          <ul className="mt-16 border-t border-[#10204a]/20">
            {CASES.map((c, i) => (
              <li key={c.title} className="border-b border-[#10204a]/20">
                <a href={`/use-cases/${["streamers", "podcasters", "agencies"][i]}`} className="use-row group grid gap-4 py-8 sm:py-10 lg:grid-cols-[80px_1.2fr_1fr] lg:items-center">
                  <span className="hud text-[#10204a]/60">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[clamp(32px,4.68vw,72px)] leading-[0.98] tracking-[-0.035em] transition-transform duration-500 group-hover:translate-x-4">
                    {c.title}
                  </span>
                  <span>
                    <span className="block max-w-md text-[16px] leading-relaxed text-[#10204a]/80">{c.body}</span>
                    <span className="hud mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[#10204a]/60">
                      {c.points.map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

    </section>
  );
}
