import { db } from "@server/lib/db";
import { fetchWithTimeout } from "@server/lib/video/fetcher";

type Ctx = { params: Promise<{ clipId: string }> };

const ALLOWED_HOSTS = [/(^|\.)ytimg\.com$/, /(^|\.)vimeocdn\.com$/, /(^|\.)youtube\.com$/];

/**
 * Serves a clip's thumbnail from our own domain. Instagram pulls the image from here.
 * Public by design; ids are unguessable and only the public thumbnail is exposed.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { clipId } = await params;
  const clip = await db.clip.findUnique({ where: { id: clipId }, select: { video: { select: { thumbnailUrl: true, externalId: true, platform: true } } } });
  const src = clip?.video.thumbnailUrl;
  if (!src) return new Response("Not found", { status: 404 });
  const host = new URL(src).hostname;
  if (!ALLOWED_HOSTS.some((r) => r.test(host))) return new Response("Not found", { status: 404 });

  // Prefer the high-resolution YouTube frame when it exists.
  const candidates =
    clip.video.platform === "youtube" && clip.video.externalId
      ? [`https://i.ytimg.com/vi/${clip.video.externalId}/maxresdefault.jpg`, src]
      : [src];
  for (const url of candidates) {
    const res = await fetchWithTimeout(url, { timeoutMs: 10000 }).catch(() => null);
    if (res?.ok && res.headers.get("content-type")?.startsWith("image/")) {
      return new Response(res.body, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }
  return new Response("Not found", { status: 404 });
}
