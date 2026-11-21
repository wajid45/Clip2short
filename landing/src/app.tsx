import { useEffect, type ComponentType } from "react";
import { SiteHeader } from "./site/header";
import { SiteFooter } from "./site/footer";
import { PageHero } from "./site/page-hero";
import { Intro } from "./site/intro";
import { startSmoothScroll } from "./motion/smooth";
import { Home } from "./pages/home";
import { AboutPage } from "./pages/about";
import { ContactPage } from "./pages/contact";
import { PrivacyPage, RefundsPage, TermsPage } from "./pages/legal";
import { PricingPage } from "./pages/pricing-page";
import { FeaturesPage } from "./pages/features-page";
import { FaqPage } from "./pages/faq-page";
import { useCasePage } from "./pages/use-case-page";
import { EnginesPage, enginePage } from "./pages/engines-page";
import { ChangelogPage, ComparePage, GuidesPage, IntegrationsPage, PartnersPage, SecurityPage, guidePage } from "./pages/more-pages";
import { CATEGORIES } from "@shortlark/shared/categories";
import { GUIDES, USE_CASES } from "./content/site";

export interface Route {
  path: string;
  title: string;
  description: string;
  Page: ComponentType;
  /** Sitemap priority, 0 to 1. */
  priority?: number;
}

const DEFAULT_DESCRIPTION =
  "Paste a stream or video link. Clip2Short's AI finds the moments worth clipping, scores them, writes hooks and captions, and posts them to YouTube Shorts, Instagram and Facebook.";

/** Every page of the marketing site. prerender.mjs writes one static HTML file per entry. */
export const ROUTES: Route[] = [
  { path: "/", title: "Clip2Short · Turn long streams into Shorts and Reels", description: DEFAULT_DESCRIPTION, Page: Home },
  { path: "/about", title: "About · Clip2Short", description: "Why we built Clip2Short, and the principles behind it.", Page: AboutPage },
  { path: "/contact", title: "Contact · Clip2Short", description: "Questions about plans, help with your account, or a clipping partnership.", Page: ContactPage },
  { path: "/privacy", title: "Privacy policy · Clip2Short", description: "What Clip2Short collects, why, and the choices you have.", Page: PrivacyPage },
  { path: "/terms", title: "Terms of service · Clip2Short", description: "The agreement between you and Clip2Short.", Page: TermsPage },
  { path: "/refunds", title: "Refund policy · Clip2Short", description: "How cancellations, failed analyses and refunds work.", Page: RefundsPage },
  { path: "/pricing", title: "Pricing · Clip2Short", description: "Plans from $24 a month. 1 credit is 1 minute of video. Three plans, from Creator to Studio. Compare plans and find yours.", Page: PricingPage, priority: 0.9 },
  { path: "/features", title: "Features · Clip2Short", description: "AI moment finder, category engines, a frame-accurate editor, trustworthy captions, scheduling to three networks and analytics per post.", Page: FeaturesPage, priority: 0.9 },
  { path: "/faq", title: "FAQ · Clip2Short", description: "Answers about credits, sources, captions, posting, billing and privacy.", Page: FaqPage, priority: 0.7 },
  { path: "/engines", title: "Category engines · Clip2Short", description: "One AI engine for each kind of video: podcasts, gaming, movies, sports and everything else.", Page: EnginesPage, priority: 0.8 },
  ...CATEGORIES.map((c) => ({
    path: `/engines/${c.slug}`,
    title: `AI clipping for ${c.label.toLowerCase()} · Clip2Short`,
    description: `${c.engine}: ${c.looksFor.toLowerCase()}. Clips of ${c.clipSeconds[0]} to ${c.clipSeconds[1]} seconds, labelled and scored.`,
    Page: enginePage(c.id),
    priority: 0.7,
  })),
  ...USE_CASES.map((u) => ({
    path: `/use-cases/${u.slug}`,
    title: `Clip2Short for ${u.title.toLowerCase()} · ${u.tagline}`,
    description: u.intro,
    Page: useCasePage(u.slug),
    priority: 0.8,
  })),
  { path: "/integrations", title: "Integrations · Clip2Short", description: "Import from YouTube, Vimeo and video files. Post to YouTube Shorts, Instagram Reels and Facebook Pages from one queue.", Page: IntegrationsPage, priority: 0.6 },
  { path: "/security", title: "Security · Clip2Short", description: "How Clip2Short protects passwords, social tokens, payments and your videos, and which providers help run it.", Page: SecurityPage, priority: 0.5 },
  { path: "/changelog", title: "Changelog · Clip2Short", description: "Product updates to Clip2Short, newest first.", Page: ChangelogPage, priority: 0.5 },
  { path: "/guides", title: "Guides · Clip2Short", description: "Practical guides on finding clip-worthy moments, writing hooks and clipping with permission.", Page: GuidesPage, priority: 0.6 },
  ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, title: `${g.title} · Clip2Short`, description: g.summary, Page: guidePage(g.slug), priority: 0.6 })),
  { path: "/partners", title: "Partners · Clip2Short", description: "For clipping agencies, creators with clipping programs, and editors.", Page: PartnersPage, priority: 0.4 },
  { path: "/compare", title: "Clip2Short or clipping by hand · Clip2Short", description: "What changes when finding, scoring and posting clips is done for you, and what stays in your hands.", Page: ComparePage, priority: 0.5 },
];

function NotFoundPage() {
  return (
    <div className="pb-24">
      <PageHero eyebrow="404" title="This page ghosted you" body="The link may be old or mistyped. Try the home page, or head straight to your clips." />
      <div className="mx-auto mt-12 flex max-w-[1240px] gap-3 px-4 sm:px-8">
        <a href="/" className="inline-flex h-12 items-center rounded-full bg-signal px-6 text-[16px] text-on-signal hover:bg-signal-strong">
          Back to home
        </a>
        <a href="/contact" className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-[16px] hover:border-text">
          Contact us
        </a>
      </div>
    </div>
  );
}

export const NOT_FOUND: Route = { path: "/404", title: "Page not found · Clip2Short", description: DEFAULT_DESCRIPTION, Page: NotFoundPage };

export function routeFor(path: string): Route {
  const clean = path.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
  return ROUTES.find((r) => r.path === clean) ?? NOT_FOUND;
}

export function App({ path }: { path: string }) {
  const route = routeFor(path);
  useEffect(() => {
    document.title = route.title;
  }, [route.title]);
  useEffect(() => startSmoothScroll(), []);
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-text">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {route.path === "/" && <Intro />}
      <div className="grain" aria-hidden="true" />
      <SiteHeader />
      <main id="main">
        <route.Page />
      </main>
      <SiteFooter />
    </div>
  );
}
