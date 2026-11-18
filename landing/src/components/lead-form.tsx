import clsx from "clsx";
import { API_URL, appHref } from "../config";
import { useState } from "react";

/** Landing-page email capture. Saves a real lead (with UTM + referrer), then invites the visitor to finish signing up. */
export function LeadForm({ source, trialCredits, inverse = false }: { source: string; trialCredits: number; inverse?: boolean }) {
  const cta = "Start free";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          website: form.get("website") || undefined,
          utmSource: params.get("utm_source") ?? undefined,
          utmMedium: params.get("utm_medium") ?? undefined,
          utmCampaign: params.get("utm_campaign") ?? undefined,
          referrer: document.referrer || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Something went wrong. Please try again.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  // `inverse` = rendered on the inverted band (dark on light theme, light on dark theme).
  const muted = inverse ? "text-inverse-text/65" : "text-muted";
  if (state === "done") {
    return (
      <div className={clsx("rounded-xl border p-4", inverse ? "border-inverse-text/15 bg-inverse-text/5" : "border-line bg-surface")}>
        <p className={clsx("text-[15px] font-medium", inverse ? "text-inverse-text" : "text-text")}>You&apos;re on the list.</p>
        <p className={clsx("mt-1 text-sm", muted)}>
          Create your account to get {trialCredits} free credits and clip your first stream in minutes.
        </p>
        <a
          href={appHref(`/signup?email=${encodeURIComponent(email)}`)}
          className="mt-3 inline-flex h-10 items-center rounded-lg bg-signal px-4 text-sm font-medium text-white hover:bg-signal-strong"
        >
          Create my account →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={clsx(
          "flex flex-col gap-2 rounded-xl border p-1.5 shadow-sm sm:flex-row",
          inverse ? "border-inverse-text/15 bg-inverse-text/5" : "border-line bg-surface",
        )}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourchannel.com"
          aria-label="Email address"
          autoComplete="email"
          className={clsx(
            "h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] focus:outline-none",
            inverse ? "text-inverse-text placeholder:text-inverse-text/40" : "text-text placeholder:text-faint",
          )}
        />
        {/* honeypot */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button
          type="submit"
          disabled={state === "loading"}
          className="h-11 shrink-0 rounded-lg bg-signal px-5 text-[15px] font-medium text-white transition-colors hover:bg-signal-strong disabled:opacity-70"
        >
          {state === "loading" ? "Saving…" : cta}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : (
        <p className={clsx("mt-2 text-[13px]", muted)}>{trialCredits} free credits ({trialCredits} minutes of video). No card needed.</p>
      )}
    </form>
  );
}
