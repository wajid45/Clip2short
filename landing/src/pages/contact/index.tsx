import { useState } from "react";
import clsx from "clsx";
import { IconArrowRight, IconCard, IconHelp, IconMail, IconShield, IconSpark, IconUsers } from "@shortlark/shared/components/icons";
import { FlashToast } from "@shortlark/shared/components/flash-toast";
import { API_URL, appHref } from "../../config";
import { PageHero } from "../../site/page-hero";

const TOPICS = [
  { value: "general", label: "General question", icon: IconSpark },
  { value: "sales", label: "Sales and plans", icon: IconCard },
  { value: "support", label: "Help with my account", icon: IconHelp },
  { value: "billing", label: "Billing", icon: IconCard },
  { value: "partnership", label: "Partnerships", icon: IconUsers },
  { value: "legal", label: "Privacy or legal", icon: IconShield },
] as const;

const field =
  "w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[15px] text-text placeholder:text-faint transition-[border-color,box-shadow,background-color] focus:border-signal focus:bg-surface focus:ring-3 focus:ring-signal/15 focus:outline-none";

const HELP = [
  { icon: IconHelp, title: "Already a customer?", body: "Most answers are in Help inside the app: imports, captions, posting and credits.", href: appHref("/app/help"), cta: "Open Help" },
  { icon: IconUsers, title: "Running a clipping program?", body: "We work with streamers and agencies that pay clippers. Pick Partnerships in the form.", href: "#message", cta: "Write to us" },
  { icon: IconShield, title: "Privacy requests", body: "Access, export or delete your data. You can also delete your account from Settings.", href: "/privacy", cta: "Read the privacy policy" },
];

export function ContactPage() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>("general");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch(`${API_URL}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Please try again.");
      setState("sent");
    } catch (err) {
      setError((err as Error).message.replace(/^\w+: /, ""));
      setState("idle");
    }
  }

  return (
    <>
      <PageHero eyebrow="Contact" title="Slide into our inbox" body="Questions about plans, a problem with your account, or a clipping program you'd like to run with us. We reply by email, usually within one business day." />

      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-16 sm:px-8 lg:grid-cols-[1.45fr_1fr] lg:gap-10 lg:py-20">
        {/* The form */}
        <div id="message" className="relative scroll-mt-28 overflow-hidden rounded-[28px] border border-line bg-surface shadow-[0_40px_100px_-60px_rgba(0,0,0,0.35)]">
          <div className="bg-sunset h-1.5" aria-hidden="true" />
          <div className="p-6 sm:p-10">
            {state === "sent" ? (
              <div role="status" className="py-14 text-center">
                <FlashToast>Message sent. We&apos;ll reply by email.</FlashToast>
                <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-ready/15 text-ready">
                  <IconMail size={28} />
                </span>
                <h2 className="mt-6 text-[32px] leading-tight tracking-[-0.03em]">Message received</h2>
                <p className="mx-auto mt-3 max-w-sm text-muted">Thanks for writing. We&apos;ll reply to the email you gave us, usually within one business day.</p>
                <button type="button" onClick={() => setState("idle")} className="mt-8 text-sm text-signal hover:underline">
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-6">
                <h2 className="text-[30px] leading-tight tracking-[-0.03em]">Send us a message</h2>

                <fieldset>
                  <legend className="mb-2.5 text-sm text-text">What is it about?</legend>
                  <input type="hidden" name="topic" value={topic} />
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
                    {TOPICS.map(({ value, label, icon: Icon }) => {
                      const on = topic === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setTopic(value)}
                          className={clsx(
                            "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                            on ? "border-signal bg-signal-soft text-signal" : "border-line bg-surface text-text hover:border-line-strong",
                          )}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-text">
                    Your name
                    <input name="name" required maxLength={100} autoComplete="name" placeholder="Alex Rivera" className={field} />
                  </label>
                  <label className="grid gap-2 text-sm text-text">
                    Email
                    <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={field} />
                  </label>
                </div>
                <label className="grid gap-2 text-sm text-text">
                  Message
                  <textarea name="message" required minLength={10} maxLength={5000} rows={6} className={`${field} resize-y`} placeholder="Tell us what you need. Links to the video or clip help us answer faster." />
                </label>
                {/* Honeypot: hidden from people, filled by bots */}
                <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {error && <FlashToast tone="error">{error}</FlashToast>}
                <div className="flex flex-col-reverse items-start gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xs text-xs leading-relaxed text-faint">
                    We use your details only to reply. See our{" "}
                    <a href="/privacy" className="underline underline-offset-2 hover:text-text">
                      privacy policy
                    </a>
                    .
                  </p>
                  <button
                    type="submit"
                    disabled={state === "sending"}
                    className="group inline-flex h-12 items-center gap-3 rounded-full bg-signal pr-2 pl-6 text-[15px] font-medium text-on-signal shadow-[0_14px_40px_-14px_rgba(217,72,15,0.7)] transition-[background-color,transform] hover:bg-signal-strong active:scale-[0.98] disabled:opacity-60"
                  >
                    {state === "sending" ? "Sending…" : "Send message"}
                    <span className="flex size-8 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true">
                      <IconArrowRight size={15} />
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Ways we help */}
        <aside className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-[28px] bg-[#0d0e12] p-7 text-white">
            <div className="plan-glow pointer-events-none absolute inset-x-0 -top-24 h-56" aria-hidden="true" />
            <p className="hud relative text-white/55">
              <span className="text-signal">/</span> Real people
            </p>
            <p className="relative mt-4 text-[26px] leading-tight tracking-[-0.03em]">Every message is read by the team that builds Clip2Short</p>
            <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
              <div>
                <p className="text-[34px] leading-none tracking-[-0.03em]">&lt;24h</p>
                <p className="mt-1.5 text-[13px] text-white/60">typical first reply</p>
              </div>
              <div>
                <p className="text-[34px] leading-none tracking-[-0.03em]">0</p>
                <p className="mt-1.5 text-[13px] text-white/60">bots in the inbox</p>
              </div>
            </div>
          </div>

          {HELP.map((c) => (
            <a
              key={c.title}
              href={c.href}
              className="group flex gap-4 rounded-[22px] border border-line bg-white p-5 dark:bg-surface transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-signal-soft text-signal">
                <c.icon size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] text-text">{c.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{c.body}</span>
                <span className="mt-2.5 inline-flex items-center gap-1 text-sm text-signal">
                  {c.cta}
                  <IconArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </a>
          ))}
        </aside>
      </div>
    </>
  );
}
