import { useRouter } from "@/lib/nav";
import { apiUrl } from "@/lib/client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/**
 * "Log in with …": opens the network's own sign-in in a centered popup, like other
 * scheduling apps. Falls back to a full-page redirect if the browser blocks popups.
 */
export function ConnectButton({
  platform,
  label,
  variant = "primary",
  onResult,
}: {
  platform: string;
  label: string;
  variant?: "primary" | "secondary";
  onResult?: (ok: boolean, message: string) => void;
}) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function open() {
    const w = 520;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const url = apiUrl(`/api/social/connect/${platform}?popup=1`);
    const popup = window.open(url, `clip2short-connect-${platform}`, `width=${w},height=${h},left=${left},top=${top},popup=yes`);
    if (!popup) {
      window.location.href = apiUrl(`/api/social/connect/${platform}`);
      return;
    }
    setWaiting(true);

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "clip2short:oauth") return;
      cleanup();
      const ok = Boolean(e.data.ok);
      const message = String(e.data.message ?? "");
      if (onResult) {
        onResult(ok, message);
        router.refresh();
      } else {
        router.replace(`/app/accounts?${new URLSearchParams({ [ok ? "connected" : "error"]: message })}`);
      }
    };
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setWaiting(false);
    };
    window.addEventListener("message", onMessage);
    // Stop waiting if the user closes the popup without finishing.
    timer.current = setInterval(() => {
      if (popup.closed) {
        cleanup();
        router.refresh();
      }
    }, 600);
  }

  return (
    <Button size="sm" variant={variant} onClick={open} loading={waiting}>
      {waiting ? "Waiting for sign-in…" : label}
    </Button>
  );
}
