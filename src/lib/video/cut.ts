import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Cuts a clip out of a directly reachable video file with ffmpeg and streams it as MP4.
 * The source is read over HTTP with range requests (input seeking), so nothing is stored.
 * Re-encoding keeps the cut frame-accurate; `vertical` centre-crops to 9:16 at 1080×1920.
 */

export const MAX_DOWNLOAD_SEC = 10 * 60;

export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (p) return p;
  } catch {
    // fall through to a system binary
  }
  return "ffmpeg";
}

export function cutArgs(opts: { url: string; startSec: number; endSec: number; vertical: boolean }): string[] {
  const dur = Math.min(MAX_DOWNLOAD_SEC, Math.max(0.5, opts.endSec - opts.startSec));
  const video = opts.vertical
    ? ["-vf", "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:flags=lanczos,setsar=1"]
    : ["-vf", "scale='min(1920,iw)':-2"];
  return [
    "-hide_banner",
    "-loglevel", "error",
    // Only network inputs: never let a crafted URL read local files.
    "-protocol_whitelist", "http,https,tcp,tls,crypto",
    "-ss", opts.startSec.toFixed(2),
    "-i", opts.url,
    "-t", dur.toFixed(2),
    "-map", "0:v:0", "-map", "0:a:0?",
    ...video,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    // Fragmented MP4 so it can stream to the browser while encoding.
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "pipe:1",
  ];
}

export function spawnCut(opts: { url: string; startSec: number; endSec: number; vertical: boolean }): ChildProcessWithoutNullStreams {
  return spawn(ffmpegPath(), cutArgs(opts), { windowsHide: true });
}
