import { categoryOf } from "@shortlark/shared/categories";
import { PageHero } from "../site/page-hero";
import { ArrowLink, CardGrid, FinalCta, Section, SectionHead, Steps, Tags } from "../site/kit";
import { USE_CASES, type UseCase } from "../content/site";

function UseCaseView({ u }: { u: UseCase }) {
  const others = USE_CASES.filter((o) => o.slug !== u.slug);
  return (
    <>
      <PageHero eyebrow={`Use cases · ${u.title}`} title={u.tagline} body={u.intro} />

      <Section border={false} className="!pt-0">
        <SectionHead eyebrow="The problem" title="Where the hours go" />
        <CardGrid items={u.pains.map((p) => ({ title: p.title, body: p.body }))} />
      </Section>

      <Section>
        <SectionHead eyebrow="How Shortlark helps" title="From link to posted clip" intro="Four steps, most of them done for you." />
        <Steps steps={u.steps} />
      </Section>

      <Section>
        <SectionHead eyebrow="Engines you'll use" title="Tuned for this kind of video" intro="Pick the category when you paste a link; the matching engine finds the highlights." />
        <CardGrid
          cols={u.engines.length > 3 ? 4 : 3}
          items={u.engines.map((id) => {
            const c = categoryOf(id);
            return {
              title: c.label,
              tag: c.engine,
              body: `${c.looksFor}.`,
              extra: (
                <div className="space-y-5">
                  <Tags items={c.labels.slice(0, 3)} />
                  <ArrowLink href={`/engines/${c.slug}`}>About this engine</ArrowLink>
                </div>
              ),
            };
          })}
        />
      </Section>

      <Section>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hud text-muted">
              <span className="text-signal">/</span> Also built for
            </p>
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
              {others.map((o) => (
                <a key={o.slug} href={`/use-cases/${o.slug}`} className="text-[clamp(26px,3vw,44px)] leading-none tracking-[-0.03em] transition-colors hover:text-signal">
                  {o.title}
                </a>
              ))}
            </div>
          </div>
          <ArrowLink href="/pricing">See pricing</ArrowLink>
        </div>
      </Section>

      <FinalCta />
    </>
  );
}

/** One page component per use case, so the router can stay a flat list. */
export const useCasePage = (slug: string) =>
  function UseCasePage() {
    return <UseCaseView u={USE_CASES.find((u) => u.slug === slug)!} />;
  };
