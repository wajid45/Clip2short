import clsx from "clsx";
import type { ReactNode } from "react";
import { CATEGORIES } from "@shortlark/shared/categories";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { StreamScanner } from "@/components/landing/stream-scanner";
import { PageHero } from "../site/page-hero";
import { ArrowLink, Eyebrow, FinalCta, Section, Tags } from "../site/kit";
import { SplitRise } from "../motion/split";

function Panel({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <div className={clsx("rounded-[28px] border p-6 sm:p-8", dark ? "border-white/10 bg-[#0d0e12] text-white" : "border-line bg-surface")}>{children}</div>;
}

const FEATURES: { id: string; eyebrow: string; title: string; body: string; points: string[]; visual: ReactNode; link?: [string, string] }[] = [
  {
    id: "moments",
    eyebrow: "AI moment finder",
    title: "Every moment, scored and explained",
    body: "Shortlark reads the whole transcript and scores each candidate 0 to 100 on hook, stand-alone clarity, payoff and quotability. Every pick comes with a plain-English reason, so you can agree or overrule it.",
    points: ["Ranked shortlist with exact in and out points", "A reason for every pick", "Focus on main events, laughs or insights"],
    visual: <StreamScanner />,
  },
  {
    id: "engines",
    eyebrow: "Category engines",
    title: "One engine for each kind of video",
    body: "Pick the category when you import and the matching engine runs: its own model, its own idea of a highlight and the right clip length. Every clip gets a label like Goal event or Clutch play.",
    points: CATEGORIES.map((c) => `${c.label}: ${c.looksFor.toLowerCase()}`),
    visual: (
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <a key={c.id} href={`/engines/${c.slug}`} className="rounded-2xl border border-line bg-bg p-4 transition-colors hover:border-signal">
              <p className="hud text-signal">{c.engine}</p>
              <p className="mt-2 text-[20px] tracking-[-0.01em]">{c.label}</p>
            </a>
          ))}
        </div>
      </Panel>
    ),
    link: ["/engines", "Meet the engines"],
  },
  {
    id: "editor",
    eyebrow: "Clip editor",
    title: "Trim to the frame",
    body: "Move in and out points on the timeline, preview the cut, and keep the build-up and the reaction. Video files export as MP4 in their original shape or vertical 9:16.",
    points: ["Frame-accurate in and out points", "Preview before you post", "Vertical 9:16 export for video files"],
    visual: (
      <Panel>
        <div className="relative h-24 overflow-hidden rounded-2xl bg-surface-3">
          <div className="absolute inset-0 flex items-center gap-[3px] px-3" aria-hidden="true">
            {Array.from({ length: 64 }, (_, k) => (
              <span key={k} className="flex-1 rounded-full bg-line-strong" style={{ height: `${25 + Math.abs(Math.sin(k * 0.61) * 60)}%` }} />
            ))}
          </div>
          <div className="absolute inset-y-2 left-[28%] w-[36%] rounded-xl bg-signal/20 ring-2 ring-signal" />
        </div>
        <div className="hud mt-4 flex justify-between text-muted">
          <span>In 3:41:07.2</span>
          <span>0:41</span>
          <span>Out 3:41:48.0</span>
        </div>
      </Panel>
    ),
  },
  {
    id: "captions",
    eyebrow: "Captions you can trust",
    title: "Know exactly where the timing came from",
    body: "Creator captions, auto-captions, translations, Vimeo text tracks and an AI fetch agent are tried in turn. If none work, paste a transcript. Every clip shows whether its timing is exact or estimated.",
    points: ["Five caption sources, tried in order", "Paste a transcript as a fallback", "Exact or estimated timing on every clip"],
    visual: (
      <Panel>
        <ul className="space-y-2.5">
          {[
            ["Creator captions", "Exact", true],
            ["Auto-captions", "Exact", true],
            ["Translated track", "Exact", false],
            ["AI fetch agent", "Estimated", false],
            ["Pasted transcript", "Estimated", false],
          ].map(([name, timing, on]) => (
            <li key={name as string} className="flex items-center justify-between rounded-xl border border-line bg-bg px-4 py-3">
              <span className="flex items-center gap-3 text-[16px]">
                <span className={clsx("size-2 rounded-full", on ? "bg-ready" : "bg-line-strong")} />
                {name}
              </span>
              <span className="hud text-muted">{timing}</span>
            </li>
          ))}
        </ul>
      </Panel>
    ),
  },
  {
    id: "posting",
    eyebrow: "Schedule and post",
    title: "Three networks, one queue",
    body: "Publish to YouTube Shorts, Instagram Reels and Facebook Pages now, or schedule. Due posts go out every 15 minutes, and failed ones stay in the queue with the reason and a retry button.",
    points: ["Hook and caption drafted per network", "Scheduling in 15-minute slots", "Retry failed posts in one click"],
    visual: (
      <Panel dark>
        <ul className="space-y-3">
          {(
            [
              ["youtube", "YouTube Shorts", "Today · 7:45 PM"],
              ["instagram", "Instagram Reels", "Today · 8:00 PM"],
              ["facebook", "Facebook Page", "Tomorrow · 9:15 AM"],
            ] as const
          ).map(([p, name, when]) => (
            <li key={p} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <PlatformIcon platform={p} size={34} />
              <span className="flex-1 text-[16px]">{name}</span>
              <span className="hud text-white/60">{when}</span>
            </li>
          ))}
        </ul>
      </Panel>
    ),
    link: ["/integrations", "See the integrations"],
  },
  {
    id: "analytics",
    eyebrow: "Analytics",
    title: "Numbers from the source",
    body: "Views, likes, comments and shares are pulled from each network's own API, per network and per post, so you can see which clips worked and clip more like them.",
    points: ["Per post and per network", "Read live from each platform", "Spot the formats that travel"],
    visual: (
      <Panel>
        <div className="flex h-40 items-end gap-2" aria-hidden="true">
          {[34, 52, 41, 68, 59, 83, 74, 96, 88, 71, 64, 90].map((h, i) => (
            <span key={i} className={clsx("flex-1 rounded-t-md", i === 7 ? "bg-signal" : "bg-surface-3")} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="hud mt-3 text-muted">Views per post, last 12 clips</p>
      </Panel>
    ),
  },
];

export function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="Everything between a great stream and a posted Short" body="Find the moments, trim them to the frame, write the post and publish it, in one place. Here is each part in detail." />

      {FEATURES.map((f, i) => (
        <Section key={f.id} id={f.id}>
          <div className={clsx("grid items-center gap-12 lg:grid-cols-2 lg:gap-20", i % 2 && "lg:[&>*:first-child]:order-2")}>
            <div>
              <Eyebrow>
                {String(i + 1).padStart(2, "0")} · {f.eyebrow}
              </Eyebrow>
              <SplitRise as="h2" className="display mt-4 text-[clamp(34px,4vw,60px)]" parts={[f.title]} />
              <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-muted">{f.body}</p>
              <ul className="mt-6 space-y-2.5">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[16px]">
                    <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-signal" />
                    {p}
                  </li>
                ))}
              </ul>
              {f.link && (
                <div className="mt-8">
                  <ArrowLink href={f.link[0]}>{f.link[1]}</ArrowLink>
                </div>
              )}
            </div>
            <div className="min-w-0">{f.visual}</div>
          </div>
        </Section>
      ))}

      <Section>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>Built for</Eyebrow>
            <p className="mt-3 max-w-xl text-[clamp(26px,2.6vw,36px)] leading-tight tracking-[-0.02em]">Streamers, podcasters and the agencies that clip for them</p>
          </div>
          <Tags items={["Streamers and clippers", "Podcasters", "Agencies and editors"]} />
        </div>
      </Section>

      <FinalCta />
    </>
  );
}
