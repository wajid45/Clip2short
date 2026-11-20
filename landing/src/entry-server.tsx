import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { PLANS } from "@shortlark/shared/plans";
import { App, NOT_FOUND, ROUTES } from "./app";
import { ALL_FAQ } from "./content/faq";
import { GUIDES } from "./content/site";

export { NOT_FOUND, ROUTES };

/** Used at build time by prerender.mjs to write each page as static HTML. */
export function render(path: string): string {
  return renderToString(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
}

/** JSON-LD for search engines: the product on the home and pricing pages, Q&A on the FAQ page, articles for guides. */
export function structuredData(path: string, site: string): object[] {
  const org = { "@type": "Organization", name: "Shortlark", url: `${site}/`, logo: `${site}/brand/logo-mark.png` };
  if (path === "/" || path === "/pricing") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Shortlark",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: "AI that finds the moments worth clipping in long videos, scores them, writes hooks and captions, and posts them to YouTube Shorts, Instagram Reels and Facebook.",
        offers: PLANS.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "USD", category: "subscription" })),
        publisher: org,
      },
    ];
  }
  if (path === "/faq") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: ALL_FAQ.filter((f) => typeof f.a === "string").map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ];
  }
  const guide = GUIDES.find((g) => path === `/guides/${g.slug}`);
  if (guide) {
    return [{ "@context": "https://schema.org", "@type": "Article", headline: guide.title, description: guide.summary, publisher: org }];
  }
  return [];
}
