import { db } from "@server/lib/db";
import { apiUser, handle, HttpError, json } from "@server/lib/api";
import { assertPublicUrl } from "@server/lib/video/fetcher";
import { MAX_DOWNLOAD_SEC, spawnCut } from "@server/lib/video/cut";
import { rateLimit } from "@server/lib/ratelimit";

/** Hard cap on one render, so a stuck ffmpeg never holds a worker forever. */
const MAX_SECONDS = 300;


type Ctx = { params: Promise<{ id: string }> };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "clip";
}

/**
 * Downloads a clip as an MP4 file (?format=original | vertical).
 * Only for direct video-file sources: YouTube and Vimeo don't permit downloading their videos.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const clip = await db.clip.findFirst({ where: { id, userId: user.id }, include: { video: true } });
  if (!clip) throw new HttpError(404, "Clip not found.");
  if (clip.video.platform !== "direct")
    throw new HttpError(409, "Downloads are available for clips from direct video files. YouTube and Vimeo don't allow downloading their videos.");
  if (clip.endSec - clip.startSec > MAX_DOWNLOAD_SEC) throw new HttpError(400, "Downloads are limited to clips of 10 minutes or less.");
  await rateLimit(`download:${user.id}`, 20, 60 * 60e3);
  try {
    await assertPublicUrl(clip.video.sourceUrl);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  const vertical = new URL(req.url).searchParams.get("format") === "vertical";
  const proc = spawnCut({ url: clip.video.sourceUrl, startSec: clip.startSec, endSec: clip.endSec, vertical });
  let stderr = "";
  proc.stderr.on("data", (d) => {
    if (stderr.length < 2000) stderr += String(d);
  });
  const kill = () => {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  };
  const timer = setTimeout(kill, (MAX_SECONDS - 10) * 1000);
  req.signal.addEventListener("abort", kill);

  // Wait for the first bytes (or a failure) so errors become a clear message, not a broken file.
  const first = await new Promise<Buffer | null>((resolve) => {
    proc.stdout.once("data", (d: Buffer) => resolve(d));
    proc.once("close", () => resolve(null));
    proc.once("error", () => resolve(null));
  });
  if (!first) {
    clearTimeout(timer);
    console.error("[download] ffmpeg failed", stderr.slice(0, 500));
    return json(
      { error: /404|403|Server returned|Connection refused|timed out/i.test(stderr) ? "The source video couldn't be read. Check the file link is still public." : "Couldn't cut this clip. Please try again." },
      502,
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(first));
      proc.stdout.on("data", (d: Buffer) => controller.enqueue(new Uint8Array(d)));
      proc.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) controller.close();
        else controller.error(new Error(`ffmpeg exited with ${code}`));
      });
    },
    cancel: kill,
  });

  const name = `${slug(clip.title)}${vertical ? "-vertical" : ""}.mp4`;
  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
