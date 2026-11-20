import { SplitRise } from "../motion/split";

/** Title band for the inner pages (About, Contact, legal): a large serif headline, the full stop in turquoise. */
export function PageHero({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  // Headlines carry no full stop.
  const words = title.replace(/\.$/, "");
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="relative mx-auto max-w-[1240px] px-4 pt-36 pb-16 sm:px-8 sm:pt-44 sm:pb-20">
        <p className="hud text-muted">
          <span className="text-signal">/</span> {eyebrow}
        </p>
        <SplitRise
          as="h1"
          className="display mt-5 max-w-5xl text-[clamp(40px,6.66vw,101px)]"
          parts={[words]}
          stagger={14}
        />
        {body && <p className="mt-8 max-w-2xl text-[18px] leading-relaxed text-muted">{body}</p>}
      </div>
    </section>
  );
}
