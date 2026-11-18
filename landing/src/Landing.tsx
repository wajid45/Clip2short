import { CREDIT_PACKS, PLANS, TRIAL } from "@shortlark/shared/plans";
import { Logo } from "@shortlark/shared/components/logo";
import { ThemeToggle } from "@shortlark/shared/components/theme-toggle";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { appHref } from "./config";
import { LeadForm } from "@/components/lead-form";
import { HeroStage } from "@/components/landing/hero-stage";
import { Reveal, TiltCard } from "@/components/landing/reveal";
import { ShortCard } from "@/components/landing/short-card";
import { StreamScanner } from "@/components/landing/stream-scanner";
import { StoryScroll } from "@/components/landing/story-scroll";
import { Bento } from "@/components/landing/bento";
import { CreditCalculator } from "@/components/landing/credit-calculator";
import { ShortsWall } from "@/components/landing/shorts-wall";

const PLATFORMS = [
  ["youtube", "YouTube Shorts"],
  ["instagram", "Instagram Reels"],
  ["facebook", "Facebook"],
] as const;

const FAQ = [
  {
    q: "Who is Shortlark for?",
    a: "Clippers, streamers and editors who turn long streams, podcasts and videos into Shorts and Reels. Paste a VOD and get a ranked list of moments with timecodes, hooks and captions in minutes instead of hours of scrubbing.",
  },
  {
    q: "How do credits work?",
    a: `1 credit = 1 minute of video the AI analyses, so a 2-hour stream uses 120 credits. Running it again on the same video costs a quarter of that, and failed analyses are refunded. Posting and scheduling are always free. New accounts get ${TRIAL.credits} free credits for ${TRIAL.days} days, no card needed.`,
  },
  {
    q: "Plans or credit packs?",
    a: "Monthly plans are the cheapest per minute and their credits refresh each billing period. Packs are one-off top-ups that never expire. Use either, or both. Plans can be changed or cancelled any time from Billing.",
  },
  {
    q: "Can I clip other streamers' videos?",
    a: "Only when you have permission. Many streamers run clipping programs or welcome clippers in their community rules. Clip your own content or creators who have authorised it, credit them, and follow each platform's rules.",
  },
  {
    q: "Do you edit or render video?",
    a: "No. Shortlark is a timecode tool. It finds the moments and gives you exact in/out points. For YouTube Shorts you upload the clip you exported; for other networks Shortlark posts your caption with a link that opens the original at the exact second.",
  },
  {
    q: "Which sources can I import?",
    a: "Public or unlisted YouTube videos and VODs, Vimeo videos (including private ones shared with their link), and direct links to .mp4 or .webm files.",
  },
  {
    q: "What if a video has no captions?",
    a: "Shortlark tries creator captions, auto-captions, translations and Vimeo text tracks, then an AI fetch agent. If none work, paste a transcript. Every clip shows whether its timing is exact or estimated.",
  },
];

function SectionHead({ eyebrow, title, body, center }: { eyebrow: string; title: React.ReactNode; body?: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="tc text-[13px] text-signal">{eyebrow}</p>
      <h2 className="mt-3 text-[38px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[54px]">{title}</h2>
      {body && <p className={`mt-5 text-[16px] leading-relaxed text-muted ${center ? "mx-auto max-w-xl" : "max-w-xl"}`}>{body}</p>}
    </Reveal>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-text">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
          <a href="/" aria-label="Shortlark home">
            <Logo />
          </a>
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#features" className="hover:text-text">Features</a>
            <a href="#pricing" className="hover:text-text">Pricing</a>
            <a href="#faq" className="hover:text-text">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href={appHref("/login")} className="hidden h-9 items-center rounded-lg px-3 text-sm text-muted hover:text-text sm:inline-flex">
              Sign in
            </a>
            <a href={appHref("/signup")} className="inline-flex h-9 items-center rounded-lg bg-signal px-4 text-sm font-medium text-white hover:bg-signal-strong">
              Start free
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_60%_30%,black,transparent_70%)]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[640px] rounded-full bg-signal/15 blur-[140px]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-4 pt-14 pb-16 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
          <div className="animate-rise">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-signal" />
              {TRIAL.credits} free credits · no card
            </p>
            <h1 className="text-[48px] leading-[0.96] font-semibold tracking-[-0.05em] sm:text-[68px] lg:text-[84px]">
              Six-hour streams.
              <br />
              <span className="font-display font-normal tracking-[-0.01em] text-signal italic">Forty-second</span> hits.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-muted">
              Paste a VOD. Shortlark&apos;s AI reads the whole stream, ranks the moments that stop the scroll, writes the hook and caption, and
              ships them to YouTube Shorts, Instagram Reels and Facebook.
            </p>
            <div className="mt-8 max-w-[500px]">
              <LeadForm source="landing-hero" trialCredits={TRIAL.credits} />
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-muted">
              <div className="flex -space-x-2">
                {PLATFORMS.map(([id]) => (
                  <PlatformIcon key={id} platform={id} size={28} />
                ))}
              </div>
              Posts to YouTube, Instagram and Facebook from one queue
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      {/* Live scanner */}
      <section className="relative mx-auto max-w-[1240px] px-4 pb-24 sm:px-8">
        <Reveal>
          <StreamScanner />
        </Reveal>
      </section>

      {/* Platforms marquee */}
      <section className="border-y border-line bg-surface/60 py-5" aria-label="Where you can post">
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-12 pr-12">
            {[...PLATFORMS, ...PLATFORMS].map(([id, label], i) => (
              <span key={i} className="flex items-center gap-2.5 text-[15px] font-medium whitespace-nowrap text-muted">
                <PlatformIcon platform={id} size={26} className="ring-0" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: scroll story */}
      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 pt-24 sm:px-8">
        <SectionHead eyebrow="How it works" title="From a VOD link to a posted Short." />
        <div className="mt-6">
          <StoryScroll />
        </div>
      </section>

      {/* Stream wave */}
      <section className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="tc text-[13px] text-signal">The next big launch</p>
            <h2 className="mt-3 text-[38px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[54px]">
              When the biggest game drops, every streamer goes live for days.
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
              Launch weeks like GTA VI&apos;s will flood the internet with marathon streams. The clippers who post the best moment first win
              the views. Shortlark turns a 6-hour VOD into a ranked shortlist while the stream is still trending.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ["Minutes", "from VOD link to ranked moments"],
                ["0–100", "virality score on every pick"],
                ["3 networks", "posted from one queue"],
              ].map(([a, b]) => (
                <li key={a} className="rounded-xl border border-line bg-surface p-4">
                  <p className="tc text-xl font-semibold text-text">{a}</p>
                  <p className="mt-1 text-[13px] text-muted">{b}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-faint">
              Clip your own streams or creators who allow clipping. GTA VI is a trademark of Take-Two Interactive; Shortlark is not affiliated with
              or endorsed by Rockstar Games or Take-Two.
            </p>
          </Reveal>
          <Reveal delay={150} className="stage-3d">
            <div className="preserve-3d mx-auto grid max-w-[440px] grid-cols-2 gap-4" style={{ transform: "rotateX(14deg) rotateZ(-6deg)" }}>
              <div className="animate-float" style={{ animationDelay: "-1s" }}>
                <ShortCard palette="dawn" handle="marathonmoments" caption={["wait", "for", "IT"]} hot={2} score={90} time="0:28" likes="77K" comments="2.0K" progressDelay="-1s" />
              </div>
              <div className="mt-14 animate-float" style={{ animationDelay: "-3.5s" }}>
                <ShortCard palette="neon" handle="clutchcuts" caption={["chat", "called", "it", "FIRST"]} hot={3} score={86} time="0:37" likes="39K" comments="980" progressDelay="-3s" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features: bento */}
      <section id="features" className="scroll-mt-16 border-t border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8">
          <SectionHead
            eyebrow="Features"
            title={<>Everything between &ldquo;great stream&rdquo; and &ldquo;posted&rdquo;.</>}
            body="Precise about where a moment starts and ends, honest about how it knows, and fast to publish."
          />
          <div className="mt-14">
            <Bento />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-24 sm:px-8">
        <SectionHead
          center
          eyebrow="Pricing"
          title="Pay for the minutes you clip."
          body={`1 credit = 1 minute of video. Start with ${TRIAL.credits} free credits, then pick a monthly plan or top up with packs. Posting is always free.`}
        />
        <Reveal className="mt-12">
          <CreditCalculator />
        </Reveal>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 100}>
              <TiltCard
                className={`flex h-full flex-col rounded-3xl border p-8 ${p.highlight ? "border-signal bg-surface shadow-[0_30px_80px_-40px_var(--color-signal)]" : "border-line bg-surface"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.highlight && <span className="rounded-md bg-signal px-2 py-0.5 text-xs font-medium text-white">Most popular</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">${p.price}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {p.monthlyCredits.toLocaleString("en-US")} credits · {((p.price / p.monthlyCredits) * 100).toFixed(1)}¢ per minute
                </p>
                <ul className="mt-7 mb-8 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[15px] text-muted">
                      <span className="mt-[9px] h-px w-3 shrink-0 bg-signal" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={appHref(`/signup?plan=${p.id}`)}
                  className={`inline-flex h-11 items-center justify-center rounded-lg text-[15px] font-medium transition-colors ${
                    p.highlight ? "bg-signal text-white hover:bg-signal-strong" : "bg-text text-bg hover:opacity-90"
                  }`}
                >
                  Choose {p.name} · ${p.price}/mo
                </a>
                <p className="mt-2 text-center text-xs text-faint">Try it first with {TRIAL.credits} free credits</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-6">
          <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-6 sm:flex-row">
            <div>
              <p className="font-medium">Just need a few hours?</p>
              <p className="mt-1 text-sm text-muted">One-off credit packs that never expire. No subscription.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CREDIT_PACKS.map((p) => (
                <a
                  key={p.id}
                  href={appHref(`/signup?packs=${p.id}:1`)}
                  className="tc rounded-lg border border-line px-3 py-1.5 text-sm text-text transition-colors hover:border-signal hover:text-signal"
                >
                  {p.credits.toLocaleString("en-US")} credits · ${p.price}
                </a>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-4 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead eyebrow="FAQ" title="Questions, answered plainly." />
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="tc text-xl text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA over a wall of Shorts */}
      <section className="relative overflow-hidden bg-inverse text-inverse-text">
        <ShortsWall />
        <div className="relative mx-auto max-w-[1240px] px-4 py-28 sm:px-8 sm:py-36">
          <div className="mx-auto max-w-4xl rounded-[36px] border border-inverse-text/10 bg-inverse/85 px-6 py-14 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-14">
          <h2 className="mx-auto max-w-3xl text-[44px] leading-[1.0] font-semibold tracking-[-0.05em] sm:text-[64px]">
            Your next stream has a dozen Shorts in it.{" "}
            <span className="font-display font-normal tracking-normal text-signal italic">Let&apos;s find them.</span>
          </h2>
          <div className="mx-auto mt-10 max-w-[500px] text-left">
            <LeadForm source="landing-final" trialCredits={TRIAL.credits} inverse />
          </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-8">
          <Logo />
          <p>© {new Date().getFullYear()} Shortlark. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href={appHref("/login")} className="hover:text-text">
              Sign in
            </a>
            <a href="#pricing" className="hover:text-text">Pricing</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
