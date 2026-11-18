"""Cuts a clip out of a directly reachable video file with ffmpeg and streams it as MP4.

The source is read over HTTP with range requests (input seeking), so nothing is stored.
Re-encoding keeps the cut frame-accurate; `vertical` centre-crops to 9:16 at 1080×1920.
"""

from __future__ import annotations

import subprocess

from ..config import settings

MAX_DOWNLOAD_SEC = 10 * 60


def ffmpeg_path() -> str:
    if settings.ffmpeg_path:
        return settings.ffmpeg_path
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def cut_args(url: str, start_sec: float, end_sec: float, vertical: bool) -> list[str]:
    dur = min(MAX_DOWNLOAD_SEC, max(0.5, end_sec - start_sec))
    video = ["-vf", "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:flags=lanczos,setsar=1"] if vertical else ["-vf", "scale='min(1920,iw)':-2"]
    return [
        "-hide_banner",
        "-loglevel", "error",
        # Only network inputs: never let a crafted URL read local files.
        "-protocol_whitelist", "http,https,tcp,tls,crypto",
        "-ss", f"{start_sec:.2f}",
        "-i", url,
        "-t", f"{dur:.2f}",
        "-map", "0:v:0", "-map", "0:a:0?",
        *video,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        # Fragmented MP4 so it can stream to the browser while encoding.
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4", "pipe:1",
    ]  # fmt: skip


def spawn_cut(url: str, start_sec: float, end_sec: float, vertical: bool) -> subprocess.Popen[bytes]:
    flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    return subprocess.Popen(
        [ffmpeg_path(), *cut_args(url, start_sec, end_sec, vertical)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=flags,
    )
