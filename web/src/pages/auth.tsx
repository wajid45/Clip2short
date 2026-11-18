import { useEffect, useState } from "react";
import { Navigate, Outlet, useSearchParams } from "react-router";
import { Logo, LogoMark } from "@shortlark/shared/components/logo";
import { ThemeToggle } from "@shortlark/shared/components/theme-toggle";
import { TRIAL } from "@shortlark/shared/plans";
import { AuthForm, afterAuthPath } from "@/components/auth-form";
import { useTitle } from "@/lib/page-data";

const LANDING_URL = import.meta.env.VITE_LANDING_URL || "/";

/** Sign-in / sign-up frame. Visitors who are already signed in go straight on. */
export function AuthLayout() {
  const [params] = useSearchParams();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/page/me", { cache: "no-store" })
      .then((r) => live && r.ok && setSignedIn(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (signedIn) return <Navigate to={afterAuthPath(params, "login")} replace />;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <a href={LANDING_URL} aria-label="Shortlark home">
          <Logo />
        </a>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  useTitle("Sign in");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-8 text-[15px] text-muted">Sign in to your clips.</p>
      <AuthForm mode="login" />
    </>
  );
}

export function SignupPage() {
  useTitle("Create your account");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 mb-8 text-[15px] text-muted">
        Start with {TRIAL.credits} free credits ({TRIAL.credits} minutes of video). No card needed.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}

/** Final step of the popup sign-in: tells the opening tab what happened, then closes itself. */
export function OAuthCompletePage() {
  const [params] = useSearchParams();
  const ok = params.has("connected");
  const message = params.get("connected") ?? params.get("error") ?? "";

  useEffect(() => {
    const opener = window.opener as Window | null;
    if (opener && !opener.closed) {
      opener.postMessage({ type: "shortlark:oauth", ok, message }, window.location.origin);
      window.close();
    } else {
      // Opened without a popup (e.g. on mobile): continue in this tab.
      const q = new URLSearchParams({ [ok ? "connected" : "error"]: message });
      window.location.replace(`/app/accounts?${q}`);
    }
  }, [ok, message]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={36} />
      <p className={ok ? "text-ready" : "text-danger"}>{message || (ok ? "Connected." : "Something went wrong.")}</p>
      <p className="text-sm text-faint">You can close this window.</p>
    </div>
  );
}
