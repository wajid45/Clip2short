import { TRIAL } from "@shortlark/shared/plans";
import { appHref } from "../config";
import { PageHero } from "../site/page-hero";

const PRINCIPLES = [
  {
    title: "Honest about how it knows",
    body: "Every clip shows where its timing came from: creator captions, auto-captions, a pasted transcript or an estimate. You never have to guess whether an in point is exact.",
  },
  {
    title: "Your time is the product",
    body: "The goal is fewer hours scrubbing through VODs. Ranked moments, ready captions and one queue for every network exist to give those hours back.",
  },
  {
    title: "Pay for what you use",
    body: "Credits match the minutes of video you process. Posting and scheduling are free, failed analyses are refunded, and plans can be cancelled anytime.",
  },
  {
    title: "Respect for creators",
    body: "Clip your own streams or creators who welcome clippers, and credit them. Shortlark is built for clipping programs, not for taking other people's work.",
  },
];

export function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="We built the clipper we wanted to use." body="Shortlark turns long streams, podcasts and talks into short videos people actually watch." />
      <div className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-5 text-[16px] leading-relaxed text-muted">
            <p>
              Long video is where the best moments happen, and where they get lost. A six-hour stream might hold a dozen clips that could each
              reach more people than the whole broadcast, but finding them means hours of scrubbing, guessing timestamps and rewriting captions.
            </p>
            <p>
              Shortlark reads the entire transcript, scores every candidate moment on hook, stand-alone clarity, payoff and quotability, and
              hands you a ranked shortlist with exact in and out points. From there you trim, let AI draft the post for each network, and
              publish or schedule in one place.
            </p>
            <p>
              Shortlark is independent and focused on one job: getting the best moments out of long video and in front of an audience, fast. If
              something in your workflow still takes too long, tell us; that&apos;s how the product grows.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-2xl border border-line bg-surface p-5">
                <h2 className="font-medium">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-5 rounded-3xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-lg font-semibold">Try it on your next stream.</p>
            <p className="mt-1 text-sm text-muted">{TRIAL.credits} free credits, no card required.</p>
          </div>
          <div className="flex gap-2">
            <a href="/contact" className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-sm font-medium hover:border-line-strong">
              Contact us
            </a>
            <a href={appHref("/signup")} className="inline-flex h-11 items-center rounded-lg bg-signal px-5 text-sm font-medium text-on-signal hover:bg-signal-strong">
              Start free
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
