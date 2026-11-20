import { Link, useRouter, useSearchParams } from "@/lib/nav";
import { useState } from "react";
import { landingHref } from "@/lib/links";
import { ApiError, apiFetch } from "@/lib/client";
import { Button, Input, Label, Notice, PasswordInput } from "./ui";

/** Where to go after signing in: back to a workspace page, on to a plan/pack picked on the landing page, or home. */
export function afterAuthPath(params: URLSearchParams, mode: "login" | "signup"): string {
  const plan = params.get("plan");
  const packs = params.get("packs");
  const next = params.get("next");
  const safeNext = next && next.startsWith("/app") ? next : null;
  const importUrl = params.get("import");
  const intent = plan
    ? `/app/billing?plan=${encodeURIComponent(plan)}`
    : packs
      ? `/app/billing?packs=${encodeURIComponent(packs)}`
      : importUrl
        ? `/app?import=${encodeURIComponent(importUrl)}${params.get("category") ? `&category=${encodeURIComponent(params.get("category")!)}` : ""}${mode === "signup" ? "&welcome=1" : ""}`
        : null;
  return safeNext ?? intent ?? (mode === "signup" ? "/app?welcome=1" : "/app");
}

const switchLink = "font-semibold text-signal underline-offset-4 hover:text-signal-strong hover:underline";

/** Notices the sign-in page can open with (`/login?notice=...`). */
const NOTICES: Record<string, string> = {
  "reset-2fa": "Password changed. Sign in with your new password and your authenticator code.",
};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<{ message: string; code?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once the password is right on an account with two-factor sign-in: the next step asks for the code.
  const [challenge, setChallenge] = useState<string | null>(null);
  const presetEmail = params.get("email") ?? "";
  const notice = mode === "login" ? NOTICES[params.get("notice") ?? ""] : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await apiFetch<{ ok?: true; step?: "code"; challenge?: string }>(`/api/auth/${mode}`, { method: "POST", json: form });
      if (res.step === "code" && res.challenge) {
        setChallenge(res.challenge);
        setLoading(false);
        return;
      }
      router.push(afterAuthPath(params, mode));
    } catch (err) {
      const e2 = err as ApiError;
      setError({ message: e2.message, code: e2.code, email: form.email });
      setLoading(false);
    }
  }

  if (challenge)
    return (
      <CodeStep
        challenge={challenge}
        onDone={() => router.push(afterAuthPath(params, "login"))}
        onRestart={(msg) => {
          setChallenge(null);
          setError(msg ? { message: msg } : null);
        }}
      />
    );

  const withParams = (path: string) => `${path}${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <form onSubmit={onSubmit} className="space-y-[clamp(10px,2dvh,16px)]">
      {notice && !error && <Notice tone="success">{notice}</Notice>}
      {mode === "signup" && (
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={80} placeholder="Your name" />
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={presetEmail} placeholder="you@email.com" />
      </div>
      <div>
        <Label
          htmlFor="password"
          hint={
            mode === "signup" ? undefined : (
              <Link href="/forgot-password" className="font-medium text-signal hover:text-signal-strong hover:underline">
                Forgot password?
              </Link>
            )
          }
        >
          Password
        </Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 12 : 1}
          maxLength={mode === "signup" ? 128 : undefined}
          placeholder={mode === "signup" ? "12+ characters" : "Your password"}
        />
      </div>
      {error &&
        (error.code === "account_exists" ? (
          <Notice tone="error">
            An account with this email already exists.{" "}
            <Link href={`/login?email=${encodeURIComponent(error.email ?? "")}`} className={switchLink}>
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className={switchLink}>
              reset your password
            </Link>
            .
          </Notice>
        ) : (
          <Notice tone="error">{error.message}</Notice>
        ))}
      <Button type="submit" variant="primary" size="lg" className="!mt-[clamp(14px,2.6dvh,24px)] w-full" loading={loading}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      {mode === "signup" && (
        <p className="text-center text-xs leading-relaxed text-faint">
          By creating an account you agree to the{" "}
          <a href={landingHref("/terms")} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-text">
            Terms
          </a>{" "}
          and{" "}
          <a href={landingHref("/privacy")} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-text">
            Privacy policy
          </a>
          .
        </p>
      )}
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={withParams("/login")} className={switchLink}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Shortlark?{" "}
            <Link href={withParams("/signup")} className={switchLink}>
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

/** Second sign-in step for accounts with two-factor sign-in: a code from the authenticator app, or a backup code. */
function CodeStep({ challenge, onDone, onRestart }: { challenge: string; onDone: () => void; onRestart: (message?: string) => void }) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(value: string) {
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/login/code", { method: "POST", json: { challenge, code: value } });
      onDone();
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "challenge_expired") return onRestart(e.message);
      setError(e.message);
      setCode("");
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-[clamp(10px,2dvh,16px)]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <div>
        <Label htmlFor="code">{backup ? "Backup code" : "Authenticator code"}</Label>
        <Input
          id="code"
          name="code"
          key={backup ? "backup" : "totp"}
          autoFocus
          required
          value={code}
          onChange={(e) => {
            const v = backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (!backup && v.length === 6) void submit(v);
          }}
          inputMode={backup ? "text" : "numeric"}
          autoComplete={backup ? "off" : "one-time-code"}
          autoCapitalize="off"
          spellCheck={false}
          maxLength={backup ? 20 : 6}
          placeholder={backup ? "k7m2q-p9x4w" : "6-digit code"}
          className={backup ? "tc" : "tc text-center text-lg tracking-[0.4em]"}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-faint">
          {backup ? "Each backup code works once." : "Open your authenticator app and type the code shown for Shortlark."}
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" size="lg" className="!mt-[clamp(14px,2.6dvh,24px)] w-full" loading={loading} disabled={!backup && code.length !== 6}>
        Sign in
      </Button>
      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="font-semibold text-signal hover:text-signal-strong hover:underline"
          onClick={() => {
            setBackup((b) => !b);
            setCode("");
            setError(null);
          }}
        >
          {backup ? "Use my authenticator app" : "Lost your phone? Use a backup code"}
        </button>
        <button type="button" className="font-semibold text-signal hover:text-signal-strong hover:underline" onClick={() => onRestart()}>
          Use a different account
        </button>
      </div>
    </form>
  );
}
