import { CATEGORIES, type Category } from "@shortlark/shared/categories";
import { PageHero } from "../site/page-hero";
import { SplitRise } from "../motion/split";
import { Eyebrow, FaqList, FinalCta, Section, SectionHead, Tags, type QA } from "../site/kit";
import { DEMO } from "../content/site";

const SCALE = 90; // seconds shown on the clip-length rulers

/** A ruler from 0 to 90 seconds with the engine's target range filled in orange. */
function LengthBar({ range, ticks = false }: { range: [number, number]; ticks?: boolean }) {
  const [a, b] = range;
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-line" role="img" aria-label={`Clips of ${a} to ${b} seconds`}>
        <span className="absolute inset-y-0 rounded-full bg-signal" style={{ left: `${(a / SCALE) * 100}%`, width: `${((b - a) / SCALE) * 100}%` }} />
      </div>
      {ticks && (
        <div className="hud mt-2 flex justify-between text-faint" aria-hidden="true">
          {[0, 30, 60, 90].map((t) => (
            <span key={t}>{t}s</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One row of the engine index: number, name, what it hunts, clip length, link. */
function EngineRow({ c, i }: { c: Category; i: number }) {
  return (
    <li>
      <a
        href={`/engines/${c.slug}`}
        className="group grid gap-6 border-b border-line py-9 transition-colors lg:grid-cols-[72px_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)_48px] lg:items-center lg:gap-10"
      >
        <span className="hud text-signal">{String(i + 1).padStart(2, "0")}</span>
        <div>
          <h3 className="text-[clamp(32px,3.6vw,54px)] leading-[1.02] tracking-[-0.03em] transition-colors group-hover:text-signal">{c.engine}</h3>
          <p className="mt-2 text-[15px] text-muted">
            For {c.label.toLowerCase()}
            {c.rightsSensitive && <span className="ml-2 rounded-full border border-draft/40 bg-draft/10 px-2 py-0.5 text-[12px] text-draft">Your rights only</span>}
          </p>
        </div>
        <div>
          <p className="text-[18px] leading-snug tracking-[-0.01em]">{c.looksFor}</p>
          <div className="mt-4">
            <Tags items={c.labels.slice(0, 3)} />
          </div>
        </div>
        <div>
          <p className="text-[15px] text-muted">
            <span className="text-[26px] leading-none tracking-[-0.02em] text-text">
              {c.clipSeconds[0]} to {c.clipSeconds[1]}
            </span>{" "}
            seconds
          </p>
          <div className="mt-3 max-w-[320px]">
            <LengthBar range={c.clipSeconds} ticks />
          </div>
        </div>
        <span
          className="flex size-12 items-center justify-center justify-self-start rounded-full border border-line transition-[background-color,border-color,color,transform] duration-300 group-hover:translate-x-1 group-hover:border-signal group-hover:bg-signal group-hover:text-on-signal lg:justify-self-end"
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </span>
      </a>
    </li>
  );
}

const CHANGES = [
  { k: "Model", title: "Its own AI model", body: "The strongest model for long podcasts, a faster one where speed matters. Each engine can run a different one." },
  { k: "Brief", title: "Its own idea of a highlight", body: "Reactions in gaming, commentary peaks in sport, claims and stories in podcasts, twists and lines in film." },
  { k: "Length", title: "The right clip length", body: "Plays land in seconds, conversations take longer. Each engine cuts to the length that fits." },
  { k: "Labels", title: "Its own vocabulary", body: "Every clip is tagged in the engine's words, so a shortlist reads like an editor's notes." },
];

const ENGINE_FAQ: QA[] = [
  {
    q: "Which category should I pick",
    a: "The one that describes the video, not the channel. A gaming channel's podcast episode belongs in Podcasts. When you paste a link, Shortlark reads the title and suggests a category; you can always change it.",
  },
  {
    q: "What if nothing fits",
    a: "Pick Other. The General engine weighs every kind of moment, from a clear insight to a big laugh, and works well on talks, tutorials, vlogs and IRL streams.",
  },
  {
    q: "Do the engines cost different amounts",
    a: "No. Every engine costs the same: 1 credit per minute of video analysed.",
  },
  {
    q: "Why do Sports and Movies mention rights",
    a: "Match broadcasts and films belong to leagues, broadcasters and studios, and platforms remove them quickly. Use those engines on footage you own or are licensed to use, or on reviews, reactions and fan streams that follow each network's rules.",
  },
];

/** /engines: all five category engines. */
export function EnginesPage() {
  return (
    <>
      <PageHero
        eyebrow="Category engines"
        title="One engine for each kind of video"
        body="A goal is not a punchline. Pick the category when you paste a link, and Shortlark runs an engine tuned for it: its own model, its own idea of a highlight and the right clip length."
      />

      {/* The index: one row per engine */}
      <Section border={false} className="!pt-0">
        <div className="border-b border-line pb-5">
          <Eyebrow>{CATEGORIES.length} engines, one per kind of video</Eyebrow>
        </div>
        <ol>
          {CATEGORIES.map((c, i) => (
            <EngineRow key={c.id} c={c} i={i} />
          ))}
        </ol>
      </Section>

      {/* What actually differs */}
      <Section>
        <SectionHead
          eyebrow="Under the hood"
          title="What changes between engines"
          intro="The same six-hour video reads differently to each engine. Four things change when you pick a category."
        />
        <ul className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {CHANGES.map((c, i) => (
            <li key={c.k} className="flex flex-col bg-surface p-7">
              <p className="hud text-faint">
                <span className="text-signal">{String(i + 1).padStart(2, "0")}</span> / {c.k}
              </p>
              <h3 className="mt-8 text-[24px] leading-[1.1] tracking-[-0.02em]">{c.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* One moment, five readings */}
      <Section>
        <SectionHead eyebrow="Side by side" title="How each engine labels a clip" intro="Every clip in your shortlist carries one of these labels, so you see what kind of moment it is before you press play." />
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <a key={c.id} href={`/engines/${c.slug}`} className="group rounded-[24px] border border-line bg-surface p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-signal/50">
              <p className="text-[20px] tracking-[-0.02em] transition-colors group-hover:text-signal">{c.label}</p>
              <ul className="mt-5 space-y-2 text-[15px] text-muted">
                {c.labels.map((l) => (
                  <li key={l} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                    {l}
                  </li>
                ))}
              </ul>
            </a>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <SplitRise as="h2" className="display mt-4 text-[clamp(38px,5vw,76px)]" parts={["Picking a category"]} />
          </div>
          <FaqList items={ENGINE_FAQ} />
        </div>
      </Section>
      <FinalCta />
    </>
  );
}

function EngineView({ c }: { c: Category }) {
  const example = (DEMO as Record<string, (typeof DEMO)["sports"]>)[c.id];
  return (
    <>
      <PageHero eyebrow={`Category engines · ${c.engine}`} title={`AI clipping for ${c.label.toLowerCase()}`} body={c.summary} />

      <Section border={false} className="!pt-0">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-line bg-surface p-7">
            <Eyebrow>Looks for</Eyebrow>
            <p className="mt-4 text-[22px] leading-snug tracking-[-0.01em]">{c.looksFor}</p>
          </div>
          <div className="rounded-[24px] border border-line bg-surface p-7">
            <Eyebrow>Clip length</Eyebrow>
            <p className="mt-4 text-[40px] leading-none tracking-[-0.03em]">
              {c.clipSeconds[0]} to {c.clipSeconds[1]}
              <span className="hud ml-2 text-muted">seconds</span>
            </p>
          </div>
          <div className="rounded-[24px] border border-line bg-surface p-7">
            <Eyebrow>Best for</Eyebrow>
            <ul className="mt-4 space-y-1.5 text-[17px]">
              {c.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Moment labels" title="How it tags each clip" intro="Every clip in your shortlist carries one of these, so you can see what kind of moment it is at a glance." />
        <div className="mt-10">
          <Tags items={c.labels} />
        </div>
      </Section>

      {example && (
        <Section>
          <SectionHead eyebrow="Example" title="What a shortlist looks like" />
          <ul className="mt-12 grid gap-3 lg:grid-cols-3">
            {example.moments.map((m) => (
              <li key={m.title} className="rounded-[24px] border border-line bg-surface p-6">
                <p className="hud text-muted">{m.label}</p>
                <p className="mt-4 text-[19px] leading-snug tracking-[-0.01em]">{m.title}</p>
                <p className="mt-2 text-[14px] text-muted">{m.reason}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-faint">Illustrative example.</p>
        </Section>
      )}

      {c.rightsSensitive && (
        <Section>
          <div className="rounded-[24px] border border-draft/40 bg-draft/10 p-8">
            <p className="text-[22px] tracking-[-0.01em]">Clip only what you have the rights to</p>
            <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-muted">
              {c.id === "sports"
                ? "Match broadcasts are owned by leagues and broadcasters and are removed quickly when posted without permission. Use this engine on footage you own or are licensed to use, fan streams, shows and podcasts."
                : "Films and series are protected by their studios. Use this engine on your own productions, or on reviews, recaps and reactions that follow each network's rules."}
            </p>
          </div>
        </Section>
      )}

      <Section>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {CATEGORIES.filter((o) => o.id !== c.id).map((o) => (
            <a key={o.id} href={`/engines/${o.slug}`} className="text-[clamp(24px,2.8vw,40px)] leading-none tracking-[-0.03em] transition-colors hover:text-signal">
              {o.engine}
            </a>
          ))}
        </div>
      </Section>
      <FinalCta />
    </>
  );
}

export const enginePage = (id: string) =>
  function EnginePage() {
    return <EngineView c={CATEGORIES.find((c) => c.id === id)!} />;
  };
