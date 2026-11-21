import { useRouter } from "@/lib/nav";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "./ui";
import { IconRefresh } from "@shortlark/shared/components/icons";

const LIVE_EVERY_MS = 2 * 60 * 1000;

/**
 * Live analytics: pulls fresh numbers from YouTube, Instagram and Facebook as soon as the page
 * opens, then every 2 minutes while it's on screen (not in a hidden tab, to spare the networks'
 * API limits). The icon refreshes on demand.
 */
export function RefreshStatsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const pull = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      await apiFetch<{ refreshed: number }>("/api/analytics/refresh", { method: "POST" });
      setUpdated(new Date());
      setError(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void pull();
    const id = setInterval(() => document.visibilityState === "visible" && void pull(), LIVE_EVERY_MS);
    const onShow = () => document.visibilityState === "visible" && updated && Date.now() - updated.getTime() > LIVE_EVERY_MS && void pull();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull]);

  return (
    <div className="flex items-center gap-3">
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ready opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-ready" />
          </span>
          Live{updated && ` · updated ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
        </span>
      )}
      <Button size="sm" aria-label="Refresh stats now" title="Refresh stats now" className="w-8 px-0" disabled={loading} onClick={() => void pull()}>
        <IconRefresh size={15} className={loading ? "animate-spin" : undefined} />
      </Button>
    </div>
  );
}
