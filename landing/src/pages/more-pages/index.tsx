import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { PageHero } from "../../site/page-hero";
import { ArrowLink, CardGrid, Eyebrow, FinalCta, Section, SectionHead, Steps } from "../../site/kit";
import { CHANGELOG, DESTINATIONS, GUIDES, IMPORT_SOURCES, type Guide } from "../../content/site";

/* ── /integrations ──────────────────────────────────────────────────────── */

export function IntegrationsPage() {
  return (
    <>
      <PageHero eyebrow="Integrations" title="Paste from anywhere, post everywhere" body="Paste a link from YouTube, Vimeo or a video file. Connect YouTube, Instagram and Facebook once and publish to all three from one queue." />
      <Section border={false} className="!pt-0">
        <SectionHead eyebrow="Post to" title="Three networks" />
        <ul className="mt-12 grid gap-3 lg:grid-cols-3">
          {DESTINATIONS.map((d) => (
            <li key={d.name} className="flex flex-col rounded-[24px] border border-line bg-surface p-7">
              <PlatformIcon platform={d.platform} size={44} />
              <h3 className="mt-6 text-[26px] leading-tight tracking-[-0.02em]">{d.name}</h3>
              <p className="mt-3 flex-1 text-[16px] leading-relaxed text-muted">{d.body}</p>
              <p className="mt-6 border-t border-line pt-5 text-[14px] leading-relaxed text-muted">
                <span className="hud mb-1 block text-faint">Access</span>
                {d.access}
              </p>
            </li>
          ))}
        </ul>
      </Section>
      <Section>
        <SectionHead eyebrow="Import from" title="Sources" intro="Clip2Short reads the title, length and captions of a link. YouTube and Vimeo videos are never downloaded." />
        <CardGrid items={IMPORT_SOURCES.map((s) => ({ title: s.name, body: s.body }))} />
      </Section>
      <Section>
        <SectionHead eyebrow="Connecting" title="How connecting works" />
        <Steps
          steps={[
            { title: "Sign in once per account", body: "A pop-up asks the network for permission. Clip2Short never sees your password." },
            { title: "Choose what to share", body: "For Facebook and Instagram you pick the Pages and linked accounts; only those appear in Clip2Short." },
            { title: "Disconnect anytime", body: "Remove an account in Social accounts. Queued posts for it are cancelled and its tokens are deleted." },
          ]}
        />
      </Section>
      <FinalCta title="One queue, every feed" accent="Post once, go everywhere" button="Connect my channels" />
    </>
  );
}

/* ── /security ──────────────────────────────────────────────────────────── */

export function SecurityPage() {
  return (
    <>
      <PageHero eyebrow="Security" title="Your data stays locked in" body="What Clip2Short stores, how it is protected, and the services that help us run it." />
      <Section border={false} className="!pt-0">
        <CardGrid
          items={[
            { title: "Passwords", body: "Stored only as bcrypt hashes. Changing or resetting a password signs you out everywhere else." },
            { title: "Social tokens", body: "Access tokens for YouTube, Instagram and Facebook are encrypted at rest with AES-256-GCM and used only to post and read stats for you." },
            { title: "Sessions", body: "Signed, HTTP-only cookies that scripts on the page cannot read. Sign out from every device in Settings." },
            { title: "Payments", body: "Handled by Stripe. Card details never reach our servers." },
            { title: "Your videos", body: "YouTube and Vimeo videos are not downloaded; we read their captions and metadata. Video files are processed only to cut the clips you ask for." },
            { title: "Team access", body: "Our admin console is a separate site that needs a password and an authenticator code, and every action in it is logged." },
          ]}
        />
      </Section>
      <Section>
        <SectionHead eyebrow="Service providers" title="Who helps us run Clip2Short" intro="Payments, email, the AI model and the social networks you connect each see only what they need. The full list is in the privacy policy." />
        <div className="mt-8">
          <ArrowLink href="/privacy#processors">See the providers</ArrowLink>
        </div>
      </Section>
      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Your choices</Eyebrow>
            <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-muted">
              Disconnect a social account at any time, and delete your account from Settings: it removes your videos, clips, connected accounts and post history, and cancels any subscription.
            </p>
          </div>
          <div className="flex flex-col gap-4 lg:items-end lg:justify-end">
            <ArrowLink href="/privacy">Privacy policy</ArrowLink>
            <ArrowLink href="/contact">Report a security issue</ArrowLink>
          </div>
        </div>
      </Section>
      <FinalCta title="Locked in, stress free" accent="Clip with peace of mind" button="Start clipping safely" />
    </>
  );
}

/* ── /changelog ─────────────────────────────────────────────────────────── */

export function ChangelogPage() {
  return (
    <>
      <PageHero eyebrow="Changelog" title="Fresh drops, newest first" body="Product updates, newest first." />
      <Section border={false} className="!pt-0">
        <ol className="border-t border-line">
          {CHANGELOG.map((e) => (
            <li key={e.title} className="grid gap-4 border-b border-line py-10 lg:grid-cols-[220px_1fr] lg:gap-12">
              <p className="hud text-muted">{e.date}</p>
              <div>
                <h2 className="text-[clamp(26px,2.6vw,38px)] leading-tight tracking-[-0.02em]">{e.title}</h2>
                <ul className="mt-5 space-y-2.5">
                  {e.items.map((it) => (
                    <li key={it} className="flex gap-3 text-[17px] leading-relaxed text-muted">
                      <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 rounded-full bg-signal" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Section>
      <FinalCta title="New drops, all the time" accent="Be first to try them" button="Try the latest" />
    </>
  );
}

/* ── /guides ────────────────────────────────────────────────────────────── */

export function GuidesPage() {
  return (
    <>
      <PageHero eyebrow="Guides" title="Clip smarter, not harder" body="Short, practical guides on finding moments, writing hooks and clipping the right way." />
      <Section border={false} className="!pt-0">
        <ul className="grid gap-3 lg:grid-cols-3">
          {GUIDES.map((g, i) => (
            <li key={g.slug}>
              <a href={`/guides/${g.slug}`} className="group flex h-full flex-col rounded-[24px] border border-line bg-surface p-7 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-signal/50">
                <p className="hud text-faint">
                  <span className="text-signal">{String(i + 1).padStart(2, "0")}</span> / {g.minutes} min read
                </p>
                <h2 className="mt-6 flex-1 text-[26px] leading-[1.1] tracking-[-0.02em] group-hover:text-signal">{g.title}</h2>
                <p className="mt-4 text-[16px] leading-relaxed text-muted">{g.summary}</p>
              </a>
            </li>
          ))}
        </ul>
      </Section>
      <FinalCta title="Read less, clip more" accent="Go make it real" button="Put it to work" />
    </>
  );
}

function GuideView({ g }: { g: Guide }) {
  const next = GUIDES[(GUIDES.findIndex((x) => x.slug === g.slug) + 1) % GUIDES.length];
  return (
    <>
      <PageHero eyebrow={`Guides · ${g.minutes} min read`} title={g.title} body={g.summary} />
      <Section border={false} className="!pt-0">
        <article className="mx-auto max-w-[720px]">
          {g.sections.map((s) => (
            <section key={s.heading} className="mb-12">
              <h2 className="text-[clamp(26px,2.6vw,36px)] leading-tight tracking-[-0.02em]">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-4 text-[18px] leading-[1.75] text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
          <div className="mt-16 flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <ArrowLink href="/guides">All guides</ArrowLink>
            <a href={`/guides/${next.slug}`} className="text-[18px] tracking-[-0.01em] hover:text-signal">
              Next: {next.title}
            </a>
          </div>
        </article>
      </Section>
      <FinalCta title="Knowledge unlocked" accent="Now put it to work" button="Try this now" />
    </>
  );
}

export const guidePage = (slug: string) =>
  function GuidePage() {
    return <GuideView g={GUIDES.find((g) => g.slug === slug)!} />;
  };

/* ── /partners ──────────────────────────────────────────────────────────── */

export function PartnersPage() {
  return (
    <>
      <PageHero eyebrow="Partners" title="Run your clipping squad with us" body="For clipping agencies, creators who run clipping programs, and editors who want to bring Clip2Short to their clients." />
      <Section border={false} className="!pt-0">
        <CardGrid
          items={[
            { title: "Clipping agencies", body: "Run many channels from one workspace with a queue per account and analytics per post. Tell us your volume and we'll find the right setup." },
            { title: "Creators with clipping programs", body: "Point your clippers to Clip2Short so their clips start on the right line and credit you properly." },
            { title: "Editors and educators", body: "Teaching clipping, or editing for clients? We'd like to hear how Clip2Short could fit your work." },
          ]}
        />
      </Section>
      <Section>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[clamp(24px,2.6vw,36px)] leading-tight tracking-[-0.02em]">Tell us about your channels and how you clip today</p>
          <ArrowLink href="/contact">Get in touch</ArrowLink>
        </div>
      </Section>
      <FinalCta title="Clipping squad? We vibe" accent="Let's build together" button="Partner up" href="/contact" />
    </>
  );
}

/* ── /compare ───────────────────────────────────────────────────────────── */

export function ComparePage() {
  const rows: [string, string, string][] = [
    ["Finding moments", "Watch or scrub the whole video, note timestamps", "Every moment scored and ranked from the transcript"],
    ["Knowing what works", "Gut feeling", "A score for hook, clarity, payoff and quotability, with a reason"],
    ["In and out points", "Set by hand in an editor", "Proposed by the AI, adjustable to the frame"],
    ["Hooks and captions", "Written from scratch for each network", "Drafted per network from what was said"],
    ["Posting", "Upload to each network separately", "One queue for YouTube, Instagram and Facebook"],
    ["Scheduling", "Reminders and calendars", "Pick a time; posts go out in 15-minute slots"],
    ["Results", "Check each network's dashboard", "Views, likes, comments and shares per post in one place"],
  ];
  return (
    <>
      <PageHero eyebrow="Compare" title="Clip2Short vs clipping by hand, no contest" body="What changes when the searching, scoring and posting are done for you, and what stays in your hands." />
      <Section border={false} className="!pt-0">
        <div className="overflow-x-auto rounded-[24px] border border-line">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2/60">
                <th className="hud px-6 py-4 font-normal text-muted">Task</th>
                <th className="px-6 py-4 text-[20px] font-normal tracking-[-0.01em]">By hand</th>
                <th className="px-6 py-4 text-[20px] font-normal tracking-[-0.01em] text-signal">With Clip2Short</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([task, hand, us]) => (
                <tr key={task} className="border-b border-line last:border-0">
                  <td className="px-6 py-4 text-[16px]">{task}</td>
                  <td className="px-6 py-4 text-[16px] text-muted">{hand}</td>
                  <td className="px-6 py-4 text-[16px] text-text">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section>
        <SectionHead eyebrow="What stays yours" title="The editor's eye" intro="Clip2Short proposes; you decide. You choose which moments to keep, adjust every cut, and edit every caption before anything is posted." />
      </Section>
      <FinalCta title="Stop scrubbing at 3am" accent="Let AI do the boring part" button="Make the switch" />
    </>
  );
}
