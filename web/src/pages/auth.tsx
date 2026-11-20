import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { Logo, LogoMark } from "@shortlark/shared/components/logo";
import { ThemeToggle } from "@shortlark/shared/components/theme-toggle";
import { AUTH_PHOTOS, AuthPhotoPanel } from "@shortlark/shared/components/auth-visual";
import { AuthForm, afterAuthPath } from "@/components/auth-form";
import { useTitle } from "@/lib/page-data";
import { LANDING_URL, landingHref } from "@/lib/links";


/** What the photo half says on each sign-in page. */
function panelFor(path: string) {
  if (path.startsWith("/signup"))
    return {
      photo: AUTH_PHOTOS.signup,
      eyebrow: "Start free",
      title: "Six hour streams",
      accent: "Forty second hits",
      points: ["Start free, no card needed", "Pick a category, paste a link", "Ranked moments with hooks and captions"],
    };
  if (path.startsWith("/forgot-password") || path.startsWith("/reset-password"))
    return { photo: AUTH_PHOTOS.reset, eyebrow: "Account", title: "Back to your clips", accent: "in a minute", points: ["The link works once and expires in an hour", "Other devices are signed out after a reset"] };
  return {
    photo: AUTH_PHOTOS.signin,
    eyebrow: "Welcome back",
    title: "Your next stream",
    accent: "has a dozen Shorts in it",
    points: ["Every moment scored and explained", "One queue for YouTube, Instagram and Facebook"],
  };
}

/** Sign-in / sign-up frame: the form on the left, a photo with the pitch on the right. Signed-in visitors go straight on. */
export function AuthLayout({ allowSignedIn = false }: { allowSignedIn?: boolean }) {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [signedIn, setSignedIn] = useState(false);
  const panel = panelFor(pathname);

  useEffect(() => {
    if (allowSignedIn) return;
    let live = true;
    fetch("/api/page/me", { cache: "no-store" })
      .then((r) => live && r.ok && setSignedIn(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [allowSignedIn]);

  if (signedIn) return <Navigate to={afterAuthPath(params, "login")} replace />;
  return (
    // One column on phones (logo bar, photo, form, footer); on wide screens the photo fills the
    // left half and the form sits on the right.
    <div className="flex min-h-dvh flex-col bg-bg min-[960px]:grid min-[960px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[960px]:grid-rows-[auto_1fr_auto]">
      <header className="relative flex items-center justify-center px-6 py-[clamp(10px,2dvh,20px)] sm:px-10 min-[960px]:col-start-2 min-[960px]:row-start-1 min-[960px]:justify-between">
        <a href={LANDING_URL} aria-label="Shortlark home">
          <Logo size={30} />
        </a>
        <span className="absolute right-6 sm:right-10 min-[960px]:static">
          <ThemeToggle />
        </span>
      </header>
      <div className="hidden min-[960px]:col-start-1 min-[960px]:row-span-3 min-[960px]:row-start-1 min-[960px]:block min-[960px]:py-3 min-[960px]:pl-3">
        <AuthPhotoPanel {...panel} className="rounded-[24px] min-[960px]:sticky min-[960px]:top-3 min-[960px]:h-[calc(100dvh-24px)] min-[960px]:rounded-[28px]" />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-[clamp(12px,3dvh,48px)] sm:px-10 min-[960px]:col-start-2 min-[960px]:row-start-2">
        <div className="w-full max-w-[420px]">
          <Outlet />
        </div>
      </main>
      <footer className="flex flex-col items-center gap-3 px-6 pb-[clamp(12px,2.5dvh,24px)] text-xs text-faint sm:px-10 min-[960px]:col-start-2 min-[960px]:row-start-3 min-[960px]:flex-row min-[960px]:flex-wrap min-[960px]:justify-between">
        <span>© {new Date().getFullYear()} Shortlark</span>
        <span className="flex gap-4">
          <a href={landingHref("/terms")} target="_blank" rel="noopener" className="hover:text-text">
            Terms
          </a>
          <a href={landingHref("/privacy")} target="_blank" rel="noopener" className="hover:text-text">
            Privacy
          </a>
          <a href={landingHref("/contact")} target="_blank" rel="noopener" className="hover:text-text">
            Help
          </a>
        </span>
      </footer>
    </div>
  );
}

export function LoginPage() {
  useTitle("Sign in");
  return (
    <>
      <h1 className="text-center font-display text-[clamp(28px,4.2dvh,36px)] leading-tight tracking-[-0.02em] min-[960px]:text-left">Welcome back</h1>
      <p className="mt-1 mb-[clamp(16px,3.4dvh,32px)] text-center text-[15px] text-muted min-[960px]:text-left">Sign in to your clips.</p>
      <AuthForm mode="login" />
    </>
  );
}

export function SignupPage() {
  useTitle("Create your account");
  return (
    <>
      <h1 className="text-center font-display text-[clamp(28px,4.2dvh,36px)] leading-tight tracking-[-0.02em] min-[960px]:text-left">Create your account</h1>
      <p className="mt-1 mb-[clamp(16px,3.4dvh,32px)] text-center text-[15px] text-muted min-[960px]:text-left">
        Start free, no card needed.
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
