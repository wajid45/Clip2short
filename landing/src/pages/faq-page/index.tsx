import { PageHero } from "../../site/page-hero";
import { ArrowLink, Eyebrow, FaqList, FinalCta, Section } from "../../site/kit";
import { FAQ_GROUPS } from "../../content/faq";

export function FaqPage() {
  let n = 0;
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions? We got you" body="Credits, sources, captions, posting and privacy. Can't find yours? Write to us and a person will answer." />
      <Section border={false} className="!pt-0">
        <div className="grid gap-12 lg:grid-cols-[260px_1fr]">
          {/* Topic jump list */}
          <nav aria-label="Topics" className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Topics</Eyebrow>
            <ul className="mt-4 flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {FAQ_GROUPS.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`} className="block rounded-full border border-line px-3 py-1.5 text-[15px] transition-colors hover:border-signal hover:text-signal lg:rounded-lg lg:border-0 lg:px-0">
                    {g.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-16">
            {FAQ_GROUPS.map((g) => {
              const start = n;
              n += g.items.length;
              return (
                <div key={g.id} id={g.id} className="scroll-mt-28">
                  <h2 className="mb-4 text-[clamp(28px,2.8vw,40px)] leading-tight tracking-[-0.02em]">{g.title}</h2>
                  <FaqList items={g.items} start={start} />
                </div>
              );
            })}
            <div className="rounded-[24px] border border-line bg-surface p-8">
              <p className="text-[22px] tracking-[-0.01em]">Still have a question?</p>
              <p className="mt-2 text-[16px] text-muted">We reply by email, usually within one business day.</p>
              <div className="mt-5">
                <ArrowLink href="/contact">Contact us</ArrowLink>
              </div>
            </div>
          </div>
        </div>
      </Section>
      <FinalCta title="Still curious?" accent="Just try it, no card" button="Try it free" />
    </>
  );
}
