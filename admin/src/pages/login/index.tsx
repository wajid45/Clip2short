import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import QRCode from "qrcode";
import { LogoMark } from "@shortlark/shared/components/logo";
import { AUTH_PHOTOS, AuthPhotoPanel } from "@shortlark/shared/components/auth-visual";
import { AuroraBackdrop } from "@shortlark/shared/components/aurora-backdrop";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { OtpInput } from "../../components/otp-input";
import { useToast } from "../../components/toast";
import { Alert, Button, Field, Input, PasswordInput } from "../../components/ui";
import { ThemeButton } from "../../components/shell";

type Step =
  | { kind: "password" }
  | { kind: "code" }
  | { kind: "email"; emailToken: string }
  | { kind: "enroll"; enrollToken: string; secret: string; otpauthUrl: string };
type Enrol = { step: "enroll"; enrollToken: string; secret: string; otpauthUrl: string };

export function QrCode({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: "M", color: { dark: "#111318", light: "#ffffff" } }).then(setSrc, () => setSrc(null));
  }, [text]);
  return (
    <div className="mx-auto flex size-[236px] items-center justify-center rounded-2xl bg-white p-2">
      {src ? <img src={src} alt="QR code for your authenticator app" width={220} height={220} /> : <span className="text-xs text-faint">Making the code…</span>}
    </div>
  );
}

export function ManualKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const grouped = secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-faint">Can&apos;t scan? Enter this key in the app as a time-based key:</p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <code className="tc text-[13px] break-all text-text">{grouped}</code>
        <Button
          size="sm"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(secret).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { me, reload } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /** Emails a fresh setup code (the password is still in memory from the first step). */
  async function resendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ step?: string; emailToken?: string }>("/auth/login", { body: { email, password } });
      if (res.step === "verify-email" && res.emailToken) {
        setStep({ kind: "email", emailToken: res.emailToken });
        setCode("");
        toast(`New code sent to ${email}.`);
        setCooldown(30);
      } else {
        setStep({ kind: "password" });
      }
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (me) navigate(next.startsWith("/") ? next : "/", { replace: true });
  }, [me, next, navigate]);

  async function submit(withCode?: string) {
    setBusy(true);
    setError(null);
    try {
      if (step.kind === "enroll") {
        await api("/auth/enroll", { body: { enrollToken: step.enrollToken, code: withCode ?? code } });
        await reload();
        return;
      }
      if (step.kind === "email") {
        const res = await api<Enrol>("/auth/enroll/email", { body: { emailToken: step.emailToken, code: withCode ?? code } });
        setStep({ kind: "enroll", enrollToken: res.enrollToken, secret: res.secret, otpauthUrl: res.otpauthUrl });
        setCode("");
        return;
      }
      const res = await api<{ ok?: true; step?: "code" | "verify-email"; emailToken?: string }>("/auth/login", {
        body: { email, password, code: step.kind === "code" ? (withCode ?? code) : undefined },
      });
      if (res.step === "code") setStep({ kind: "code" });
      else if (res.step === "verify-email") setStep({ kind: "email", emailToken: res.emailToken! });
      else await reload();
      setCode("");
    } catch (e) {
      setError((e as ApiError).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Same arrangement as the app's sign-in: phones stack logo bar, photo, form; wide screens put
    // the photo on the left and the form on the right.
    <div className="auth-page relative isolate flex min-h-dvh flex-col bg-bg min-[960px]:grid min-[960px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[960px]:grid-rows-[auto_1fr]">
        {/* The landing hero's aurora, as on the app's sign-in pages */}
        <AuroraBackdrop className="absolute inset-0 -z-10 min-[960px]:col-start-2 min-[960px]:row-span-2 min-[960px]:row-start-1" />
        <header className="relative flex items-center justify-center px-6 py-[clamp(10px,2dvh,20px)] sm:px-10 min-[960px]:col-start-2 min-[960px]:row-start-1 min-[960px]:justify-between">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={30} />
            <span className="text-[20px] font-semibold tracking-[-0.03em] text-text">clip<span className="text-[1.18em]">2</span>short</span>
            <span className="rounded-md border border-signal/40 bg-signal-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-signal uppercase">Admin</span>
          </span>
          <span className="absolute right-6 sm:right-10 min-[960px]:static">
            <ThemeButton />
          </span>
        </header>
      <div className="hidden min-[960px]:col-start-1 min-[960px]:row-span-2 min-[960px]:row-start-1 min-[960px]:block min-[960px]:py-3 min-[960px]:pl-3">
        <AuthPhotoPanel
          photo={AUTH_PHOTOS.admin}
          eyebrow="Operator console"
          title="Run Clip2Short"
          accent="from one place"
          points={["Accounts, plans and credits at a glance", "Grant credits, suspend, sign out", "Every action written to the audit log"]}
          className="rounded-[24px] min-[960px]:sticky min-[960px]:top-3 min-[960px]:h-[calc(100dvh-24px)] min-[960px]:rounded-[28px]"
        />
      </div>
        <main className="flex flex-1 items-center justify-center px-4 py-[clamp(12px,3dvh,48px)] sm:px-10 min-[960px]:col-start-2 min-[960px]:row-start-2">
      <div className="w-full max-w-[420px]">
        <div className="mb-[clamp(16px,3.4dvh,32px)] text-center min-[960px]:text-left">
          <h1 className="font-display text-[clamp(28px,4.2dvh,36px)] leading-tight tracking-[-0.02em] text-text">
            {step.kind === "password" && "Sign in to the console"}
            {step.kind === "code" && "Enter your code"}
            {step.kind === "email" && "Check your email"}
            {step.kind === "enroll" && "Set up your authenticator"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {step.kind === "password" && "Use your Clip2Short admin account."}
            {step.kind === "code" && "The 6-digit code from your authenticator app."}
            {step.kind === "email" && `We sent a 6-digit code to ${email}.`}
            {step.kind === "enroll" && "Every sign-in will ask for a code from this app."}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {error && <Alert kind="error">{error}</Alert>}

          {step.kind === "password" && (
            <div className="space-y-4">
              <Field label="Email">
                <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clip2short.com" />
              </Field>
              <Field label="Password">
                <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
              </Field>
              <Button variant="primary" type="submit" className="mt-2 w-full" loading={busy}>
                Continue
              </Button>
            </div>
          )}

          {step.kind === "code" && (
            <div className="space-y-5">
              <OtpInput value={code} onChange={setCode} onComplete={(c) => void submit(c)} autoFocus />
              <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
                Sign in
              </Button>
              <button type="button" className="w-full text-center text-[13px] font-semibold text-signal hover:text-signal-strong hover:underline dark:text-text dark:hover:text-signal" onClick={() => setStep({ kind: "password" })}>
                Use a different account
              </button>
            </div>
          )}

          {step.kind === "email" && (
            <div className="space-y-5">
              <OtpInput value={code} onChange={setCode} onComplete={(c) => void submit(c)} autoFocus />
              <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
                Continue
              </Button>
              <div className="flex items-center justify-between gap-4 text-[13px]">
                <button
                  type="button"
                  className="font-semibold text-signal hover:text-signal-strong hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline dark:text-text dark:hover:text-signal"
                  onClick={() => void resendCode()}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
                </button>
                <button type="button" className="font-semibold text-signal hover:text-signal-strong hover:underline dark:text-text dark:hover:text-signal" onClick={() => setStep({ kind: "password" })}>
                  Use a different account
                </button>
              </div>
            </div>
          )}

          {step.kind === "enroll" && (
            <div className="space-y-4">
              <ol className="space-y-1.5 text-[13px] text-muted">
                <li>1. Open Google Authenticator, 1Password, Authy or Microsoft Authenticator.</li>
                <li>2. Add an account and scan this code.</li>
                <li>3. Type the 6-digit code it shows.</li>
              </ol>
              <QrCode text={step.otpauthUrl} />
              <ManualKey secret={step.secret} />
              <OtpInput value={code} onChange={setCode} onComplete={(c) => void submit(c)} />
              <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
                Confirm and sign in
              </Button>
            </div>
          )}
        </form>
      </div>
        </main>
    </div>
  );
}
