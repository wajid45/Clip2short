import { ArrowLink, FaqList, FinalCta } from "../site/kit";
import { ALL_FAQ } from "../content/faq";
import { Hero } from "../home/hero";
import { Showcase } from "../home/showcase";
import { Statement } from "../home/statement";
import { Flythrough } from "../home/flythrough";
import { Engines } from "../home/engines";
import { UseCases } from "../home/use-cases";
import { Features } from "../home/features";
import { Pricing } from "../home/pricing";
import { SplitRise } from "../motion/split";

function Faq() {
  return (
    <section id="faq" className="scroll-mt-0 border-t border-line">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-28 sm:px-8 sm:py-36 lg:grid-cols-[0.9fr_1.3fr]">
        <div>
          <p className="hud text-muted">
            <span className="text-signal">/</span> FAQ
          </p>
          <SplitRise as="h2" className="display mt-4 text-[clamp(43px,5.4vw,86px)]" parts={["Questions,\nanswered"]} />
          <div className="mt-8">
            <ArrowLink href="/faq">All questions</ArrowLink>
          </div>
        </div>
        <FaqList items={ALL_FAQ.slice(0, 6)} />
      </div>
    </section>
  );
}

export function Home() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <Showcase />
      <Statement />
      <Flythrough />
      <Engines />
      <UseCases />
      <Features />
      <Pricing />
      <Faq />

      <FinalCta />
    </div>
  );
}
