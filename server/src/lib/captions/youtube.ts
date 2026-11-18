import { fetchWithTimeout } from "../video/fetcher";
import { parseJson3, parseTimedTextXml, parseVttOrSrt, type Segment } from "./parse";

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" for auto-generated
  name?: string;
  isTranslatable?: boolean;
}

export interface YouTubePlayerData {
  title?: string;
  description?: string;
  author?: string;
  lengthSeconds?: number;
  tracks: CaptionTrack[];
  defaultAudioLanguage?: string;
  playabilityStatus?: string;
  playabilityReason?: string;
}

export interface CaptionResult {
  segments: Segment[];
  source: string; // e.g. youtube:manual:en
  language: string;
  note: string;
}

/** Extracts a JSON object assigned to `marker` in a page script, using brace matching. */
export function extractJsonAfter(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx + marker.length);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromPlayerResponse(pr: any): YouTubePlayerData {
  const vd = pr?.videoDetails ?? {};
  const mf = pr?.microformat?.playerMicroformatRenderer ?? {};
  const tl = pr?.captions?.playerCaptionsTracklistRenderer;
  const tracks: CaptionTrack[] = (tl?.captionTracks ?? []).map((t: any) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    kind: t.kind,
    name: t.name?.simpleText ?? t.name?.runs?.map((r: any) => r.text).join(""),
    isTranslatable: t.isTranslatable,
  }));
  const audioIdx = tl?.audioTracks?.[tl?.defaultAudioTrackIndex ?? 0]?.defaultCaptionTrackIndex;
  return {
    title: vd.title ?? mf.title?.simpleText,
    description: vd.shortDescription ?? mf.description?.simpleText,
    author: vd.author ?? mf.ownerChannelName,
    lengthSeconds: vd.lengthSeconds ? Number(vd.lengthSeconds) : mf.lengthSeconds ? Number(mf.lengthSeconds) : undefined,
    tracks: tracks.filter((t) => t.baseUrl),
    defaultAudioLanguage: typeof audioIdx === "number" ? tracks[audioIdx]?.languageCode : undefined,
    playabilityStatus: pr?.playabilityStatus?.status,
    playabilityReason: pr?.playabilityStatus?.reason,
  };
}

/** Strategy 1: the public watch page. Also yields title/description/length. */
export async function fetchWatchPage(id: string): Promise<YouTubePlayerData | null> {
  const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${id}&hl=en&has_verified=1&bpctr=9999999999`, {
    headers: { Cookie: "CONSENT=YES+cb; SOCS=CAI" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const pr = extractJsonAfter(html, "ytInitialPlayerResponse = ") ?? extractJsonAfter(html, "ytInitialPlayerResponse\":");
  return pr ? fromPlayerResponse(pr) : null;
}

const INNERTUBE_CLIENTS = [
  { clientName: "ANDROID", clientVersion: "19.44.38", androidSdkVersion: 34, ua: "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip" },
  { clientName: "IOS", clientVersion: "19.45.4", deviceModel: "iPhone16,2", ua: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X)" },
  { clientName: "WEB", clientVersion: "2.20241120.01.00" },
  { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" },
] as const;

/** Strategy 2: the InnerTube player API with several client identities. */
export async function fetchInnertube(id: string): Promise<YouTubePlayerData[]> {
  const out: YouTubePlayerData[] = [];
  for (const c of INNERTUBE_CLIENTS) {
    try {
      const { ua, ...client } = c as typeof c & { ua?: string };
      const res = await fetchWithTimeout("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ua ? { "User-Agent": ua } : {}),
        },
        body: JSON.stringify({
          videoId: id,
          context: { client: { ...client, hl: "en", gl: "US" }, thirdParty: { embedUrl: "https://www.youtube.com" } },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        timeoutMs: 12000,
      });
      if (!res.ok) continue;
      const data = fromPlayerResponse(await res.json());
      out.push(data);
      if (data.tracks.length) break;
    } catch {
      // try next client
    }
  }
  return out;
}

/** oEmbed is the most reliable source for a title when the watch page is blocked. */
export async function fetchOEmbed(id: string): Promise<{ title?: string; author?: string } | null> {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return { title: j.title, author: j.author_name };
  } catch {
    return null;
  }
}

/** Orders tracks: manual in the spoken language, then auto-generated, then other manual tracks, English first. */
export function rankTracks(tracks: CaptionTrack[], spoken?: string): CaptionTrack[] {
  const lang = (t: CaptionTrack) => t.languageCode.split("-")[0];
  const sp = spoken?.split("-")[0];
  const score = (t: CaptionTrack) => {
    let s = 0;
    if (t.kind !== "asr") s += 10;
    if (sp && lang(t) === sp) s += 20;
    if (t.kind === "asr") s += 15; // auto track is almost always in the spoken language
    if (lang(t) === "en") s += 3;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a));
}

function withParam(url: string, key: string, value: string) {
  const u = new URL(url.startsWith("http") ? url : `https://www.youtube.com${url}`);
  u.searchParams.set(key, value);
  return u.toString();
}

/** Tries json3, then srv3 XML, then VTT for one track URL. */
export async function downloadTrack(baseUrl: string): Promise<{ segments: Segment[]; format: string } | null> {
  const attempts: Array<[string, (b: string) => Segment[]]> = [
    ["json3", parseJson3],
    ["srv3", parseTimedTextXml],
    ["vtt", parseVttOrSrt],
    ["", parseTimedTextXml],
  ];
  for (const [fmt, parser] of attempts) {
    try {
      const url = fmt ? withParam(baseUrl, "fmt", fmt) : baseUrl;
      const res = await fetchWithTimeout(url, { timeoutMs: 15000 });
      if (!res.ok) continue;
      const body = await res.text();
      if (!body.trim()) continue; // YouTube returns 200 + empty body when it wants a PO token
      const segments = parser(body);
      if (segments.length) return { segments, format: fmt || "xml" };
    } catch {
      // next format
    }
  }
  return null;
}

/**
 * Pulls captions using every server-side strategy:
 * watch-page tracks → InnerTube tracks (several clients) → each in json3/srv3/vtt →
 * translation fallback (tlang=en) when original tracks return nothing.
 */
export async function pullYouTubeCaptions(
  id: string,
  pre?: YouTubePlayerData | null,
): Promise<{ result: CaptionResult | null; attempts: string[]; player: YouTubePlayerData | null }> {
  const attempts: string[] = [];
  const sources: Array<{ label: string; data: YouTubePlayerData }> = [];
  const watch = pre ?? (await fetchWatchPage(id).catch(() => null));
  if (watch) sources.push({ label: "watch page", data: watch });
  else attempts.push("Watch page: unavailable");

  const tryTracks = async (label: string, data: YouTubePlayerData): Promise<CaptionResult | null> => {
    if (!data.tracks.length) {
      attempts.push(`${label}: no caption tracks listed${data.playabilityReason ? ` (${data.playabilityReason})` : ""}`);
      return null;
    }
    const ranked = rankTracks(data.tracks, data.defaultAudioLanguage);
    for (const t of ranked.slice(0, 4)) {
      const kind = t.kind === "asr" ? "asr" : "manual";
      const dl = await downloadTrack(t.baseUrl);
      if (dl) {
        return {
          segments: dl.segments,
          source: `youtube:${kind}:${t.languageCode}`,
          language: t.languageCode,
          note: `${kind === "asr" ? "YouTube auto-generated" : "Creator-uploaded"} captions (${t.name ?? t.languageCode}), fetched from the ${label} as ${dl.format}. Timings are exact.`,
        };
      }
      attempts.push(`${label}: ${kind} ${t.languageCode} track returned no text`);
    }
    // Translation fallback: YouTube sometimes serves translated tracks when originals are gated.
    const translatable = ranked.find((t) => t.isTranslatable);
    if (translatable) {
      const dl = await downloadTrack(withParam(translatable.baseUrl, "tlang", "en"));
      if (dl)
        return {
          segments: dl.segments,
          source: `youtube:translated:en`,
          language: "en",
          note: `Original captions were unavailable, so we used YouTube's English translation of the ${translatable.languageCode} track. Timings are exact; wording is machine-translated.`,
        };
      attempts.push(`${label}: translation fallback returned no text`);
    }
    return null;
  };

  for (const s of sources) {
    const r = await tryTracks(s.label, s.data);
    if (r) return { result: r, attempts, player: watch };
  }
  const inner = await fetchInnertube(id);
  if (!inner.length) attempts.push("InnerTube API: no response");
  for (const d of inner) {
    const r = await tryTracks("InnerTube API", d);
    if (r) return { result: r, attempts, player: watch ?? d };
  }
  return { result: null, attempts, player: watch ?? inner[0] ?? null };
}
