import { useState } from "react";
import { IconHelp, IconMail, IconUsers } from "@shortlark/shared/components/icons";
import { API_URL, appHref } from "../config";
import { PageHero } from "../site/page-hero";

const TOPICS = [
  ["general", "General question"],
  ["sales", "Sales and plans"],
  ["support", "Help with my account"],
  ["billing", "Billing"],
  ["partnership", "Partnerships and clipping programs"],
  ["legal", "Privacy or legal"],
] as const;

const field =
  "w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-faint transition-colors focus:border-signal focus:outline-none";

export function ContactPage() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

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
      <PageHero eyebrow="Contact" title="Talk to a human." body="Questions about plans, a problem with your account, or a clipping program you'd like to run with us. We reply by email, usually within one business day." />
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-line bg-surface p-5 sm:p-8">
          {state === "sent" ? (
            <div role="status" className="py-10 text-center">
              <IconMail size={28} className="mx-auto text-signal" />
              <h2 className="mt-4 text-xl font-semibold">Message received.</h2>
              <p className="mt-2 text-muted">Thanks for writing. We&apos;ll reply to the email you gave us.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <input name="name" required maxLength={100} autoComplete="name" className={field} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Email
                  <input name="email" type="email" required autoComplete="email" className={field} />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Topic
                <select name="topic" defaultValue="general" className={`${field} appearance-none`}>
                  {TOPICS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Message
                <textarea name="message" required minLength={10} maxLength={5000} rows={6} className={`${field} resize-y`} placeholder="How can we help?" />
              </label>
              {/* Honeypot: hidden from people, filled by bots */}
              <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-faint">
                  We use your details only to reply. See our{" "}
                  <a href="/privacy" className="underline underline-offset-2 hover:text-text">
                    privacy policy
                  </a>
                  .
                </p>
                <button
                  type="submit"
                  disabled={state === "sending"}
                  className="inline-flex h-11 items-center rounded-lg bg-signal px-6 text-sm font-medium text-on-signal transition-colors hover:bg-signal-strong disabled:opacity-60"
                >
                  {state === "sending" ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
        <aside className="space-y-4">
          {[
            { icon: IconHelp, title: "Already a customer?", body: "Most answers are in Help inside the app: imports, captions, posting and credits.", href: appHref("/app/help"), cta: "Open Help" },
            { icon: IconUsers, title: "Running a clipping program?", body: "We work with streamers and agencies that pay clippers. Pick Partnerships in the form.", href: null, cta: null },
            { icon: IconMail, title: "Privacy requests", body: "To access, export or delete your data, choose Privacy or legal, or delete your account from Settings.", href: "/privacy", cta: "Read the privacy policy" },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-line bg-surface p-5">
              <c.icon className="text-signal" />
              <h2 className="mt-3 font-medium">{c.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
              {c.href && (
                <a href={c.href} className="mt-3 inline-block text-sm font-medium text-signal hover:underline">
                  {c.cta}
                </a>
              )}
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
