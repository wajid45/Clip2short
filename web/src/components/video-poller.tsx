import { useRouter } from "@/lib/nav";
import { apiUrl } from "@/lib/client";
import { useEffect, useRef } from "react";

/** Polls the video's pipeline state and refreshes the server-rendered page when it changes. */
export function VideoPoller({ id, active, signature }: { id: string; active: boolean; signature: string }) {
  const router = useRouter();
  const last = useRef(signature);
  last.current = signature;

  useEffect(() => {
    if (!active) return;
    let stop = false;
    let delay = 2500;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch(apiUrl(`/api/videos/${id}`), { cache: "no-store", credentials: "include" });
        if (r.ok) {
          const v = await r.json();
          const sig = `${v.captionStatus}|${v.analysisStatus}|${v.clipCount}`;
          if (sig !== last.current) router.refresh();
        }
      } catch {
        // transient network error; keep polling
      }
      delay = Math.min(delay * 1.15, 8000);
      if (!stop) setTimeout(tick, delay);
    };
    const t = setTimeout(tick, delay);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [active, id, router]);

  return null;
}
