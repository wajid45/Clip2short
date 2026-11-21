import { landingHref } from "@/lib/links";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { SettingsData } from "@shortlark/shared/api-types";
import { TRIAL } from "@shortlark/shared/plans";
import { IconMail } from "@shortlark/shared/components/icons";
import { apiFetch } from "@/lib/client";
import { Link, refreshPageData, useRouter } from "@/lib/nav";
import { PageData, useTitle } from "@/lib/page-data";
import { Button, Card, Input, Label, Notice, PageHeader, PasswordInput } from "@/components/ui";
import { LocalDateTime } from "@/components/local-time";
import { TwoFactorSettings } from "@/components/two-factor-settings";

function useForm<T>(submit: (data: T) => Promise<string | void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function run(data: T) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const msg = await submit(data);
      if (msg) setDone(msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <PageData<SettingsData> path="/settings" title="Settings">
      {(d) => (
        <>
          <PageHeader title="Settings" description="Your profile, password and account." />
          <div className="space-y-5">
            <ProfileForm name={d.name} email={d.email} twoFactor={d.twoFactor.enabled} />
            <PasswordForm />
            <Section title="Two-factor sign-in" description="A code from your phone on top of your password. Recommended.">
              <TwoFactorSettings status={d.twoFactor} />
            </Section>
            <Section title="Account" description="A summary of what's in your workspace.">
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                {[
                  ["Member since", <LocalDateTime key="d" iso={d.createdAt} />],
                  ["Plan", d.planName ?? "Free"],
                  ["Videos", d.videos],
                  ["Clips", d.clips],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-xs text-faint">{k}</dt>
                    <dd className="mt-1 text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted">
                Manage your plan and credits in{" "}
                <Link href="/app/billing" className="text-text underline underline-offset-4">
                  Billing
                </Link>{" "}
                and connected networks in{" "}
                <Link href="/app/accounts" className="text-text underline underline-offset-4">
                  Social accounts
                </Link>
                .
              </p>
            </Section>
            <DeleteAccount hasSubscription={d.hasSubscription} />
          </div>
        </>
      )}
    </PageData>
  );
}

function ProfileForm({ name, email, twoFactor }: { name: string; email: string; twoFactor: boolean }) {
  const [values, setValues] = useState({ name, email, currentPassword: "", code: "" });
  const emailChanged = values.email.trim().toLowerCase() !== email.toLowerCase();
  const f = useForm(async () => {
    await apiFetch("/api/account", { method: "PATCH", json: { ...values, code: twoFactor && emailChanged ? values.code : undefined } });
    setValues((v) => ({ ...v, currentPassword: "", code: "" }));
    refreshPageData();
    return "Profile saved.";
  });
  return (
    <Section title="Profile" description="Your name appears in the sidebar; your email is how you sign in.">
      <form
        className="grid max-w-lg gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void f.run(undefined);
        }}
      >
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required maxLength={80} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} required />
        </div>
        {emailChanged && (
          <div>
            <Label htmlFor="current-for-email" hint="Needed to change your email">
              Current password
            </Label>
            <PasswordInput
              id="current-for-email"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(e) => setValues({ ...values, currentPassword: e.target.value })}
              required
            />
          </div>
        )}
        {emailChanged && twoFactor && (
          <div>
            <Label htmlFor="code-for-email" hint="From your authenticator app, or a backup code">
              Two-factor code
            </Label>
            <Input
              id="code-for-email"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={12}
              value={values.code}
              onChange={(e) => setValues({ ...values, code: e.target.value })}
              required
            />
          </div>
        )}
        {f.error && <Notice tone="error">{f.error}</Notice>}
        {f.done && <Notice tone="success">{f.done}</Notice>}
        <div>
          <Button type="submit" variant="primary" loading={f.busy}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "" });
  const f = useForm(async () => {
    await apiFetch("/api/account/password", { method: "POST", json: values });
    setValues({ currentPassword: "", newPassword: "" });
    return "Password changed. Other devices have been signed out.";
  });
  return (
    <Section title="Password" description="Changing it signs you out on every other device.">
      <form
        className="grid max-w-lg gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void f.run(undefined);
        }}
      >
        <div>
          <Label htmlFor="current-password">Current password</Label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(e) => setValues({ ...values, currentPassword: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-password" hint="At least 12 characters">
            New password
          </Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={values.newPassword}
            onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
            required
          />
        </div>
        {f.error && <Notice tone="error">{f.error}</Notice>}
        {f.done && <Notice tone="success">{f.done}</Notice>}
        <div>
          <Button type="submit" loading={f.busy}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

function DeleteAccount({ hasSubscription }: { hasSubscription: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const f = useForm(async () => {
    await apiFetch("/api/account", { method: "DELETE", json: values });
    router.replace("/login");
  });
  return (
    <Section
      title="Delete account"
      description="Permanently deletes your videos, clips, scheduled posts, connected accounts and credits. This can't be undone."
    >
      <form
        className="grid max-w-lg gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void f.run(undefined);
        }}
      >
        {hasSubscription && <Notice tone="warn">Your subscription will be canceled immediately. Unused monthly credits are not refunded.</Notice>}
        <div>
          <Label htmlFor="delete-password">Password</Label>
          <PasswordInput
            id="delete-password"
            autoComplete="current-password"
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="delete-confirm" hint="Type DELETE to confirm">
            Confirmation
          </Label>
          <Input
            id="delete-confirm"
            value={values.confirm}
            onChange={(e) => setValues({ ...values, confirm: e.target.value })}
            autoComplete="off"
            required
          />
        </div>
        {f.error && <Notice tone="error">{f.error}</Notice>}
        <div>
          <Button type="submit" variant="danger" loading={f.busy} disabled={values.confirm !== "DELETE" || !values.password}>
            Delete my account
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ── Help ─────────────────────────────────────────────────────────────────────

const HELP: { group: string; items: { q: string; a: ReactNode }[] }[] = [
  {
    group: "Getting started",
    items: [
      {
        q: "Which links can I import?",
        a: "Public or unlisted YouTube videos and VODs, Vimeo videos (private ones work with their share link), and direct links to .mp4, .webm, .m4v or .mov files.",
      },
      {
        q: "How long does finding moments take?",
        a: "Captions usually arrive within seconds. The AI then reads the whole transcript and scores every candidate moment; long streams take a minute or two. You can leave the page while it runs.",
      },
      {
        q: "The video has no captions. What now?",
        a: "Clip2Short tries several caption sources automatically. If none work, open the video and paste a transcript (timestamps are optional). Without timestamps, clip placement is estimated, so check the in and out points in the editor.",
      },
    ],
  },
  {
    group: "Clips and posting",
    items: [
      {
        q: "What does the virality score mean?",
        a: "A 0 to 100 estimate built from four parts: how strong the first seconds are, whether the clip makes sense on its own, the payoff, and how quotable it is. Above 85 is rare and worth posting first.",
      },
      {
        q: "Can I download a clip as a video file?",
        a: "Yes, for direct video files: open the clip and choose Download (original or vertical 9:16). YouTube and Vimeo don't allow their videos to be downloaded, so for those export your cut from your editor.",
      },
      {
        q: "How do scheduled posts work?",
        a: "Pick accounts and a time on any clip. The publisher runs every 15 minutes on the quarter hour, and failed posts are retried. Follow progress in Queue.",
      },
    ],
  },
  {
    group: "Credits and billing",
    items: [
      {
        q: "How are credits used?",
        a: `1 credit = 1 minute of video the AI analyses. Running it again on the same video costs a quarter, and failed analyses are refunded automatically. New accounts get ${TRIAL.credits} free credits for ${TRIAL.days} days.`,
      },
      {
        q: "How do I change or cancel my plan?",
        a: (
          <>
            Open{" "}
            <Link href="/app/billing" className="text-text underline underline-offset-4">
              Billing
            </Link>{" "}
            and choose Manage billing. Changes take effect from your next billing period.
          </>
        ),
      },
    ],
  },
  {
    group: "Account",
    items: [
      {
        q: "I forgot my password.",
        a: (
          <>
            Use{" "}
            <Link href="/forgot-password" className="text-text underline underline-offset-4">
              Forgot password
            </Link>{" "}
            on the sign-in page and we'll email you a link.
          </>
        ),
      },
      {
        q: "How do I delete my account?",
        a: (
          <>
            In{" "}
            <Link href="/app/settings" className="text-text underline underline-offset-4">
              Settings
            </Link>
            , at the bottom of the page.
          </>
        ),
      },
    ],
  },
];

const CONTACT_URL = landingHref("/contact");

export function HelpPage() {
  useTitle("Help");
  return (
    <>
      <PageHeader title="Help" description="Answers to the questions we hear most." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-8">
          {HELP.map((g) => (
            <section key={g.group}>
              <h2 className="mb-3 text-sm font-medium text-muted">{g.group}</h2>
              <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                {g.items.map((it) => (
                  <details key={it.q} className="group px-4 py-3.5 sm:px-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                      {it.q}
                      <span className="tc text-lg text-faint transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{it.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside>
          <Card className="p-5 lg:sticky lg:top-8">
            <IconMail className="text-signal" />
            <h2 className="mt-3 font-medium">Still stuck?</h2>
            <p className="mt-1 text-sm text-muted">Tell us what happened and we'll get back to you by email, usually within one business day.</p>
            <a href={CONTACT_URL} className="mt-4 inline-flex h-9 items-center rounded-lg bg-signal px-3.5 text-sm font-medium text-white hover:bg-signal-strong">
              Contact support
            </a>
          </Card>
        </aside>
      </div>
    </>
  );
}

// ── Forgot / reset password (signed out) ────────────────────────────────────

export function ForgotPasswordPage() {
  useTitle("Reset your password");
  const [email, setEmail] = useState("");
  const f = useForm(async () => {
    await apiFetch("/api/auth/forgot", { method: "POST", json: { email } });
    return "If an account uses that email, a reset link is on its way. It works for 60 minutes.";
  });
  return (
    <>
      <h1 className="text-center font-display text-[34px] leading-tight tracking-[-0.02em] min-[960px]:text-left">Reset your password</h1>
      <p className="mt-1.5 mb-8 text-center text-[15px] text-muted min-[960px]:text-left">Enter your account email and we'll send you a link to choose a new password.</p>
      {f.done ? (
        <Notice tone="success">{f.done}</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(undefined);
          }}
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@email.com" />
          </div>
          {f.error && <Notice tone="error">{f.error}</Notice>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={f.busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-signal underline-offset-4 hover:text-signal-strong hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export function ResetPasswordPage() {
  useTitle("Choose a new password");
  const router = useRouter();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const f = useForm(async () => {
    const res = await apiFetch<{ ok: true; signIn?: boolean }>("/api/auth/reset", { method: "POST", json: { token, password } });
    // Two-factor accounts aren't signed in by an emailed link: they sign in again with their code.
    router.replace(res.signIn ? "/login?notice=reset-2fa" : "/app");
  });

  useEffect(() => {
    if (!token) return setValid(false);
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((r) => setValid(r.ok))
      .catch(() => setValid(false));
  }, [token]);

  return (
    <>
      <h1 className="text-center font-display text-[34px] leading-tight tracking-[-0.02em] min-[960px]:text-left">Choose a new password</h1>
      <p className="mt-1.5 mb-8 text-center text-[15px] text-muted min-[960px]:text-left">You'll be signed in, and signed out everywhere else.</p>
      {valid === false ? (
        <Notice tone="error">
          This reset link has expired or was already used.{" "}
          <Link href="/forgot-password" className="font-medium underline underline-offset-4">
            Ask for a new one
          </Link>
          .
        </Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void f.run(undefined);
          }}
        >
          <div>
            <Label htmlFor="password">
              New password
            </Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              minLength={12}
            maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={valid === null}
              placeholder="12+ characters"
            />
          </div>
          {f.error && <Notice tone="error">{f.error}</Notice>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={f.busy} disabled={valid === null}>
            Save and sign in
          </Button>
        </form>
      )}
    </>
  );
}
