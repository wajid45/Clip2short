import "server-only";
import { fetchWithTimeout } from "../video/fetcher";
import { parseVttOrSrt } from "./parse";
import type { CaptionResult } from "./youtube";

export interface VimeoMeta {
  title?: string;
  description?: string;
  author?: string;
  durationSec?: number;
  thumbnailUrl?: string;
}

interface VimeoTextTrack {
  url: string;
  lang: string;
  kind?: string;
  label?: string;
}

function splitId(externalId: string) {
  const [id, hash] = externalId.split(":");
  return { id, hash };
}

export async function fetchVimeoOEmbed(url: string): Promise<VimeoMeta | null> {
  try {
    const res = await fetchWithTimeout(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      title?: string; description?: string; author_name?: string; duration?: number; thumbnail_url?: string;
    };
    return {
      title: j.title,
      description: j.description,
      author: j.author_name,
      durationSec: j.duration,
      thumbnailUrl: j.thumbnail_url,
    };
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchPlayerConfig(externalId: string): Promise<any | null> {
  const { id, hash } = splitId(externalId);
  try {
    const res = await fetchWithTimeout(`https://player.vimeo.com/video/${id}/config${hash ? `?h=${hash}` : ""}`, {
      headers: { Referer: "https://vimeo.com/" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchVimeoMeta(url: string, externalId: string): Promise<VimeoMeta> {
  const [oembed, config] = await Promise.all([fetchVimeoOEmbed(url), fetchPlayerConfig(externalId)]);
  const v = config?.video ?? {};
  return {
    title: oembed?.title ?? v.title,
    description: oembed?.description ?? "",
    author: oembed?.author ?? v.owner?.name,
    durationSec: oembed?.durationSec ?? v.duration,
    thumbnailUrl: oembed?.thumbnailUrl ?? v.thumbs?.["640"] ?? v.thumbs?.base,
  };
}

/** Pulls Vimeo text tracks (creator captions/subtitles) from the player config. */
export async function pullVimeoCaptions(externalId: string): Promise<{ result: CaptionResult | null; attempts: string[] }> {
  const attempts: string[] = [];
  const config = await fetchPlayerConfig(externalId);
  if (!config) return { result: null, attempts: ["Vimeo player config: unavailable (private or embedding disabled)"] };
  const tracks: VimeoTextTrack[] = config?.request?.text_tracks ?? [];
  if (!tracks.length) return { result: null, attempts: ["Vimeo: the creator hasn't uploaded any text tracks"] };

  const ranked = [...tracks].sort((a, b) => {
    const s = (t: VimeoTextTrack) => (t.kind === "captions" ? 2 : 0) + (t.lang?.startsWith("en") ? 1 : 0);
    return s(b) - s(a);
  });
  for (const t of ranked) {
    try {
      const url = t.url.startsWith("http") ? t.url : `https://player.vimeo.com${t.url}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        attempts.push(`Vimeo ${t.lang} track: HTTP ${res.status}`);
        continue;
      }
      const segments = parseVttOrSrt(await res.text());
      if (segments.length)
        return {
          attempts,
          result: {
            segments,
            source: `vimeo:texttrack:${t.lang}`,
            language: t.lang,
            note: `Creator-uploaded Vimeo ${t.kind ?? "text"} track (${t.label ?? t.lang}). Timings are exact.`,
          },
        };
      attempts.push(`Vimeo ${t.lang} track: empty`);
    } catch {
      attempts.push(`Vimeo ${t.lang} track: download failed`);
    }
  }
  return { result: null, attempts };
}
