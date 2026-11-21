import type { ReactNode } from "react";
import { PLANS, TRIAL } from "@shortlark/shared/plans";
import { PageHero } from "../../site/page-hero";

const UPDATED = "November 19, 2026";

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a href={href} className="text-text underline underline-offset-4 hover:text-signal" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-2 pl-6 sm:pl-[38px]">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-signal" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Section[] }) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} body={intro} />
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs text-faint">Last updated {UPDATED}</p>
          <nav className="mt-4 hidden lg:block" aria-label="On this page">
            <ol className="space-y-2 border-l border-line">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-4 text-sm text-muted hover:border-signal hover:text-text">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <article className="max-w-3xl space-y-10 text-[15px] leading-relaxed text-muted">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight text-text">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3">{s.body}</div>
            </section>
          ))}
          <p className="border-t border-line pt-6 text-sm">
            Questions about this page? <A href="/contact">Contact us</A> and choose &ldquo;Privacy or legal&rdquo;.
          </p>
        </article>
      </div>
    </>
  );
}

// ── Privacy ──────────────────────────────────────────────────────────────────

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="What Clip2Short collects, why, who processes it on our behalf, and the choices you have."
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <List
              items={[
                <><strong className="text-text">Account details:</strong> your name, email address and a securely hashed password.</>,
                <><strong className="text-text">Content you import:</strong> the links you paste, video titles and descriptions, captions or transcripts, and the clips, captions and notes you create.</>,
                <><strong className="text-text">Connected social accounts:</strong> account names, avatars and the access tokens the platform issues. Tokens are encrypted at rest and used only to publish and read stats for posts you create.</>,
                <><strong className="text-text">Billing:</strong> your plan, credit balance and history. Card details are collected and stored by Stripe, never by us.</>,
                <><strong className="text-text">Messages and sign-ups:</strong> what you send through the contact form, and the email you leave on our website.</>,
                <><strong className="text-text">Technical data:</strong> IP address and browser type, used for security, rate limiting and abuse prevention.</>,
              ]}
            />
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <List
              items={[
                "To provide the service: find moments, generate captions and post copy, publish and schedule posts, and show analytics.",
                "To bill you and keep an accurate credit history.",
                "To send account emails such as password resets. We don't send marketing email without your consent.",
                "To keep Clip2Short secure, prevent abuse and fix problems.",
              ]}
            />
          ),
        },
        {
          id: "processors",
          title: "Service providers",
          body: (
            <>
              <p>We share data only with providers that help run Clip2Short, under contracts that limit their use of it:</p>
              <List
                items={[
                  <><strong className="text-text">AI model provider:</strong> transcripts and clip text are sent to an AI model to find moments and write post copy.</>,
                  <><strong className="text-text">Stripe:</strong> payments and subscriptions.</>,
                  <><strong className="text-text">Resend:</strong> delivery of account emails.</>,
                  <><strong className="text-text">YouTube, Instagram and Facebook:</strong> only when you connect an account and publish to it.</>,
                  "Our hosting and database providers.",
                ]}
              />
              <p>We don&apos;t sell your personal information.</p>
            </>
          ),
        },
        {
          id: "youtube",
          title: "YouTube API Services",
          body: (
            <>
              <p>
                Clip2Short uses YouTube API Services to upload videos you choose, set their visibility and read view counts. By connecting a YouTube
                channel you agree to the <A href="https://www.youtube.com/t/terms">YouTube Terms of Service</A>, and Google&apos;s use of data is
                described in the <A href="https://policies.google.com/privacy">Google Privacy Policy</A>.
              </p>
              <p>
                You can revoke Clip2Short&apos;s access at any time from <A href="https://myaccount.google.com/permissions">Google security settings</A> or
                by disconnecting the channel in Clip2Short. When you disconnect, we delete the stored tokens.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              We use only essential cookies: one that keeps you signed in, and two that remember your theme and sidebar preferences. We don&apos;t use
              advertising or cross-site tracking cookies.
            </p>
          ),
        },
        {
          id: "retention",
          title: "Retention and deletion",
          body: (
            <>
              <p>
                We keep your data while your account is open. You can delete your account at any time in Settings; that permanently removes your
                videos, clips, posts, connected accounts and credits. Billing records may be kept as long as tax law requires.
              </p>
              <p>To delete data we received from Facebook or Instagram, disconnect the account in Clip2Short or delete your Clip2Short account.</p>
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <p>
              Depending on where you live (including under the GDPR, UK GDPR and California law), you can ask to access, correct, export or delete
              your personal data, or object to how it is used. Contact us and we&apos;ll respond within 30 days. You can also complain to your
              local data protection authority.
            </p>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Passwords are hashed, social access tokens are encrypted, connections use HTTPS, and access to production data is restricted. No
              system is perfectly secure; if a breach affects you, we will tell you as the law requires.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Clip2Short is not for children under 16, and we don&apos;t knowingly collect their data.</p>,
        },
        {
          id: "changes",
          title: "Changes",
          body: <p>If we change this policy in a meaningful way we&apos;ll update the date above and tell signed-in users in the app.</p>,
        },
      ]}
    />
  );
}

// ── Terms ───────────────────────────────────────────────────────────────────

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      intro="The agreement between you and Clip2Short when you use the website and the app."
      sections={[
        {
          id: "agreement",
          title: "Agreement",
          body: <p>By creating an account or using Clip2Short you agree to these terms. If you use Clip2Short for an organisation, you confirm you can accept them on its behalf.</p>,
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <p>
              You must be at least 16, give accurate details and keep your password safe. You are responsible for activity on your account. Tell us
              straight away if you think someone else has access.
            </p>
          ),
        },
        {
          id: "content",
          title: "Content and permissions",
          body: (
            <>
              <p>
                Only import, clip and publish video you own or have permission to use. Many streamers welcome clippers or run clipping programs;
                follow their rules and credit them. You are responsible for what you publish and for following each platform&apos;s rules.
              </p>
              <p>
                You keep all rights to your content. You give Clip2Short the limited permission needed to process it for you: fetching captions,
                analysing transcripts with AI, generating copy and publishing where you tell us to.
              </p>
            </>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <List
              items={[
                "No infringing, illegal, hateful, harassing or sexually explicit content involving minors.",
                "No spam, misleading posts, or attempts to manipulate platform metrics.",
                "No scraping, overloading, reverse engineering or getting around limits or security.",
                "No reselling access without our written agreement.",
              ]}
            />
          ),
        },
        {
          id: "billing",
          title: "Credits, plans and billing",
          body: (
            <>
              <p>
                Finding moments uses credits: 1 credit for each minute of video analysed, and a quarter of that to re-run a video. New accounts get{" "}
                {TRIAL.credits} free credits that expire after {TRIAL.days} days. Plan credits ({PLANS.map((p) => `${p.name} ${p.monthlyCredits.toLocaleString("en-US")}`).join(", ")} per month) reset each billing period and don&apos;t roll over. Credit packs never expire.
              </p>
              <p>
                Plans renew automatically each month until you cancel in Billing. Cancelling stops the next renewal; you keep your plan until the
                end of the paid period. Prices may change with at least 30 days&apos; notice. Taxes may apply. See the <A href="/refunds">refund policy</A>.
              </p>
            </>
          ),
        },
        {
          id: "ai",
          title: "AI output",
          body: (
            <p>
              Moments, scores, captions and post copy are generated by AI and can be wrong. Review them before you publish. Virality scores are
              estimates, not guarantees of views or earnings.
            </p>
          ),
        },
        {
          id: "third-parties",
          title: "Third-party platforms",
          body: (
            <p>
              Publishing depends on YouTube, Instagram, Facebook and other services that can change or limit their APIs. We aren&apos;t responsible
              for their actions, outages or decisions about your content or account.
            </p>
          ),
        },
        {
          id: "termination",
          title: "Suspension and termination",
          body: (
            <p>
              You can delete your account at any time. We may suspend or close accounts that break these terms or put the service or others at
              risk, and we&apos;ll tell you why unless the law prevents it.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Warranties and liability",
          body: (
            <p>
              Clip2Short is provided &ldquo;as is&rdquo;. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses,
              and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have under
              consumer law that can&apos;t be excluded.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <p>
              We may update these terms; meaningful changes will be announced in the app before they take effect. These terms are governed by the
              laws of the country where Clip2Short&apos;s operating company is registered, without affecting your local consumer protections.
            </p>
          ),
        },
      ]}
    />
  );
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export function RefundsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund policy"
      intro="How cancellations, failed analyses and refunds work."
      sections={[
        {
          id: "automatic",
          title: "Automatic credit refunds",
          body: <p>If an AI analysis or AI copy request fails, the credits it used go straight back to your balance. You don&apos;t need to ask.</p>,
        },
        {
          id: "subscriptions",
          title: "Monthly plans",
          body: (
            <p>
              You can cancel anytime in Billing. You keep your plan until the end of the period you paid for and won&apos;t be charged again. We
              don&apos;t give partial refunds for unused time or unused monthly credits, except where the law requires it.
            </p>
          ),
        },
        {
          id: "packs",
          title: "Credit packs",
          body: <p>Unused credit packs can be refunded within 14 days of purchase. Once any credits from a pack have been used, that pack is non-refundable.</p>,
        },
        {
          id: "mistakes",
          title: "Charges made in error",
          body: <p>If you were charged twice or by mistake, contact us within 60 days and we&apos;ll refund the incorrect charge in full.</p>,
        },
        {
          id: "consumer",
          title: "EU and UK customers",
          body: (
            <p>
              You have a 14-day right to cancel a new subscription. Because the service starts as soon as you subscribe, if you cancel within those
              14 days we refund the price minus the value of the credits you used.
            </p>
          ),
        },
        {
          id: "how",
          title: "How to ask",
          body: (
            <p>
              <A href="/contact">Contact us</A> and choose &ldquo;Billing&rdquo;, with the email on your account and the charge date. Approved refunds
              go back to the original payment method, usually within 5 to 10 business days.
            </p>
          ),
        },
      ]}
    />
  );
}
