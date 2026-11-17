import "server-only";
import { cred, isConfigured } from "../integrations";
import { env } from "../env";
import { api } from "./http";
import { PublishError, type AccountContext, type SocialProvider } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * YouTube via the Data API v3.
 * Unlike the link/image networks, YouTube needs a real video file: the creator uploads
 * the clip (cut in their editor). The browser streams it to our server in chunks and
 * we relay each chunk into a resumable upload session, so nothing is stored on our side.
 * Scheduling uses YouTube's own `publishAt`, so no file has to wait in our storage.
 */

const YT = "https://www.googleapis.com/youtube/v3";
export const YT_CHUNK = 262144 * 14; // 3.5 MiB: a multiple of 256 KiB and under typical serverless body limits

function bearer(acc: AccountContext) {
  return { Authorization: `Bearer ${acc.accessToken}` };
}

export const youtube: SocialProvider = {
  id: "youtube",
  usesPkce: true,
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  configured: () => isConfigured("google"),
  authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: cred("google").id ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube",
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge ?? "",
      code_challenge_method: "S256",
    })}`,
  async exchange({ code, redirectUri, codeVerifier }) {
    const tok = await api("https://oauth2.googleapis.com/token", {
      method: "POST",
      form: {
        code,
        client_id: cred("google").id!,
        client_secret: cred("google").secret!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier ?? "",
      },
    });
    const ch = await api(`${YT}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const channels: any[] = ch.items ?? [];
    if (!channels.length) throw new Error("This Google account has no YouTube channel yet. Create one on YouTube, then connect again.");
    return channels.map((c) => ({
      externalId: c.id,
      displayName: c.snippet?.title ?? "YouTube channel",
      username: c.snippet?.customUrl?.replace(/^@/, "") ?? null,
      avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
    }));
  },
  async refresh(acc) {
    if (!acc.refreshToken) return null;
    const tok = await api("https://oauth2.googleapis.com/token", {
      method: "POST",
      form: {
        client_id: cred("google").id!,
        client_secret: cred("google").secret!,
        refresh_token: acc.refreshToken,
        grant_type: "refresh_token",
      },
    });
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? acc.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
    };
  },
  async publish() {
    throw new PublishError("YouTube posts need a video file. Use the upload form on the clip.");
  },
  async stats(acc, id) {
    const r = await api(`${YT}/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: bearer(acc) });
    const s = r.items?.[0]?.statistics;
    if (!s) return null;
    return {
      views: Number(s.viewCount ?? 0),
      likes: s.likeCount != null ? Number(s.likeCount) : null,
      comments: s.commentCount != null ? Number(s.commentCount) : null,
      shares: null,
    };
  },
};

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  privacy: "public" | "unlisted" | "private";
  publishAt: Date | null;
  madeForKids: boolean;
  size: number;
  mimeType: string;
}

/** Opens a resumable upload session and returns its URL (kept server-side). */
export async function startUpload(acc: AccountContext, m: UploadMeta): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      ...bearer(acc),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(m.size),
      "X-Upload-Content-Type": m.mimeType,
      Origin: env.appUrl,
    },
    body: JSON.stringify({
      snippet: { title: m.title, description: m.description, tags: m.tags.slice(0, 30), categoryId: "22" },
      status: {
        // YouTube only honours publishAt on private videos; it flips them public at that time.
        privacyStatus: m.publishAt ? "private" : m.privacy,
        ...(m.publishAt ? { publishAt: m.publishAt.toISOString() } : {}),
        selfDeclaredMadeForKids: m.madeForKids,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    const reason = j?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new PublishError("YouTube's daily upload quota for this app is used up. Try again tomorrow.", true);
    if (reason === "uploadLimitExceeded") throw new PublishError("This channel hit YouTube's daily upload limit.");
    throw new PublishError(j?.error?.message ?? `YouTube refused the upload (HTTP ${res.status}).`);
  }
  const location = res.headers.get("location");
  if (!location) throw new PublishError("YouTube didn't return an upload session.");
  return location;
}

/** Sends one chunk. Returns the finished video when YouTube has the whole file. */
export async function uploadChunk(
  uploadUrl: string,
  chunk: ArrayBuffer,
  offset: number,
  total: number,
): Promise<{ done: false; received: number } | { done: true; video: any }> {
  const end = offset + chunk.byteLength - 1;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${offset}-${end}/${total}` },
    body: chunk,
    signal: AbortSignal.timeout(120000),
  });
  if (res.status === 308) {
    const range = res.headers.get("range"); // e.g. "bytes=0-3670015"
    const received = range ? Number(range.split("-")[1]) + 1 : 0;
    return { done: false, received };
  }
  if (res.ok) return { done: true, video: await res.json() };
  const j = await res.json().catch(() => null);
  throw new PublishError(j?.error?.message ?? `Upload failed (HTTP ${res.status}).`, res.status >= 500);
}

export async function getVideo(acc: AccountContext, id: string): Promise<any | null> {
  const r = await api(`${YT}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`, { headers: bearer(acc) });
  return r.items?.[0] ?? null;
}

/** Sets visibility (used by "Post now" on a scheduled upload, by cancel, and to confirm scheduled posts). */
export async function setPrivacy(acc: AccountContext, id: string, privacy: "public" | "unlisted" | "private", madeForKids?: boolean) {
  await api(`${YT}/videos?part=status`, {
    method: "PUT",
    headers: { ...bearer(acc), "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      status: { privacyStatus: privacy, ...(madeForKids != null ? { selfDeclaredMadeForKids: madeForKids } : {}) },
    }),
  });
}

export function youtubeUrl(id: string) {
  return `https://youtu.be/${id}`;
}
