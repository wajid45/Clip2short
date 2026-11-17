/** Link parsing shared by client (instant validation) and server (authoritative). */

export type VideoPlatform = "youtube" | "vimeo" | "direct";

export interface ParsedSource {
  platform: VideoPlatform;
  externalId: string | null;
  canonicalUrl: string;
}

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoUrl(raw: string): ParsedSource | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "That doesn't look like a link. Paste a full URL starting with https://" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only http(s) links are supported." };
  const host = url.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (host.endsWith("youtu.be")) id = url.pathname.slice(1).split("/")[0] ?? null;
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(url.pathname);
      if (m) id = m[1];
    }
    if (!id || !YT_ID.test(id)) return { error: "We couldn't find a video ID in that YouTube link." };
    return { platform: "youtube", externalId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    const m = /\/(?:video\/)?(\d{5,})(?:\/([a-f0-9]{6,}))?/.exec(url.pathname);
    if (!m) return { error: "We couldn't find a video ID in that Vimeo link." };
    const hash = m[2] ?? url.searchParams.get("h");
    const canonical = `https://vimeo.com/${m[1]}${hash ? `/${hash}` : ""}`;
    return { platform: "vimeo", externalId: hash ? `${m[1]}:${hash}` : m[1], canonicalUrl: canonical };
  }

  if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) {
    if (isPrivateHost(host)) return { error: "Links to private or local network addresses aren't allowed." };
    return { platform: "direct", externalId: null, canonicalUrl: url.toString() };
  }

  return { error: "Paste a YouTube or Vimeo link, or a direct link to an .mp4 or .webm file." };
}

/** Blocks obvious SSRF targets. The server additionally resolves DNS before fetching. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

export function youtubeThumb(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Deep link that opens the source video at a timestamp. */
export function timestampUrl(
  v: { platform: string; sourceUrl: string; externalId: string | null },
  startSec: number,
): string {
  const t = Math.max(0, Math.floor(startSec));
  if (v.platform === "youtube" && v.externalId) return `https://youtu.be/${v.externalId}?t=${t}`;
  if (v.platform === "vimeo") {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return `${v.sourceUrl}#t=${h ? `${h}h` : ""}${m ? `${m}m` : ""}${s}s`;
  }
  return `${v.sourceUrl}#t=${t}`;
}
