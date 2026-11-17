"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/logo";

/** Final step of the popup sign-in: tells the opening tab what happened, then closes itself. */
function Complete() {
  const params = useSearchParams();
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

export default function OAuthCompletePage() {
  return (
    <Suspense>
      <Complete />
    </Suspense>
  );
}
