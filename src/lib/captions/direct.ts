import "server-only";
import { assertPublicUrl, fetchWithTimeout } from "../video/fetcher";
import { parseVttOrSrt } from "./parse";
import type { CaptionResult } from "./youtube";

/** For direct file links, look for a caption file published next to the video (same name, .vtt/.srt). */
export async function pullSiblingCaptions(videoUrl: string): Promise<{ result: CaptionResult | null; attempts: string[] }> {
  const attempts: string[] = [];
  const base = videoUrl.replace(/[?#].*$/, "").replace(/\.[a-z0-9]+$/i, "");
  for (const ext of [".vtt", ".srt", ".en.vtt", ".en.srt"]) {
    const url = base + ext;
    try {
      await assertPublicUrl(url);
      const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
      if (!res.ok) continue;
      const segments = parseVttOrSrt(await res.text());
      if (segments.length)
        return {
          attempts,
          result: {
            segments,
            source: `direct:sidecar${ext}`,
            language: ext.includes(".en.") ? "en" : "und",
            note: `Caption file found next to the video (${url.split("/").pop()}). Timings are exact.`,
          },
        };
    } catch {
      // ignore
    }
  }
  attempts.push("No .vtt or .srt caption file published alongside the video");
  return { result: null, attempts };
}

export function titleFromFileUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "Video");
    const t = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Untitled video";
  } catch {
    return "Untitled video";
  }
}
