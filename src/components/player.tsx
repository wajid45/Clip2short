"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PlayerHandle {
  getTime(): number;
  seek(t: number): void;
  play(): void;
  pause(): void;
}

interface Props {
  platform: string;
  externalId: string | null;
  sourceUrl: string;
  onTime?: (t: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onDuration?: (d: number) => void;
  onError?: (msg: string) => void;
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          scripts.delete(src);
          reject(new Error(`Couldn't load ${src}`));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  return new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    loadScript("https://www.youtube.com/iframe_api").catch(reject);
  });
}

/**
 * One player interface over YouTube (IFrame API), Vimeo (Player SDK) and HTML5 video.
 * Time is tracked locally and refreshed on an animation-friendly interval so the
 * playhead stays smooth without hammering the embedded players.
 */
export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { platform, externalId, sourceUrl, onTime, onPlayingChange, onDuration, onError },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const yt = useRef<any>(null);
  const vimeo = useRef<any>(null);
  const time = useRef(0);
  const cb = useRef({ onTime, onPlayingChange, onDuration, onError });
  cb.current = { onTime, onPlayingChange, onDuration, onError };

  useImperativeHandle(ref, () => ({
    getTime: () => time.current,
    seek: (t: number) => {
      const s = Math.max(0, t);
      time.current = s;
      cb.current.onTime?.(s);
      if (yt.current?.seekTo) yt.current.seekTo(s, true);
      else if (vimeo.current) void vimeo.current.setCurrentTime(s).catch(() => {});
      else if (videoEl.current) videoEl.current.currentTime = s;
    },
    play: () => {
      if (yt.current?.playVideo) yt.current.playVideo();
      else if (vimeo.current) void vimeo.current.play().catch(() => {});
      else void videoEl.current?.play().catch(() => {});
    },
    pause: () => {
      if (yt.current?.pauseVideo) yt.current.pauseVideo();
      else if (vimeo.current) void vimeo.current.pause().catch(() => {});
      else videoEl.current?.pause();
    },
  }));

  // YouTube
  useEffect(() => {
    if (platform !== "youtube" || !externalId || !host.current) return;
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const mount = document.createElement("div");
    host.current.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (disposed) return;
        yt.current = new YT.Player(mount, {
          videoId: externalId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, origin: window.location.origin },
          events: {
            onReady: (e: any) => {
              const d = e.target.getDuration?.();
              if (d) cb.current.onDuration?.(d);
              poll = setInterval(() => {
                const t = yt.current?.getCurrentTime?.();
                if (typeof t === "number" && Math.abs(t - time.current) > 0.03) {
                  time.current = t;
                  cb.current.onTime?.(t);
                }
              }, 100);
            },
            onStateChange: (e: any) => cb.current.onPlayingChange?.(e.data === 1),
            onError: (e: any) =>
              cb.current.onError?.(
                e.data === 101 || e.data === 150
                  ? "The owner doesn't allow this video to be embedded. You can still set timecodes by typing them."
                  : "YouTube couldn't play this video here.",
              ),
          },
        });
      })
      .catch(() => cb.current.onError?.("Couldn't load the YouTube player."));
    return () => {
      disposed = true;
      if (poll) clearInterval(poll);
      try {
        yt.current?.destroy?.();
      } catch {
        // ignore
      }
      yt.current = null;
      mount.remove();
    };
  }, [platform, externalId]);

  // Vimeo
  useEffect(() => {
    if (platform !== "vimeo" || !host.current) return;
    let disposed = false;
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.current.appendChild(mount);
    loadScript("https://player.vimeo.com/api/player.js")
      .then(() => {
        if (disposed) return;
        const V = (window as any).Vimeo;
        const p = new V.Player(mount, { url: sourceUrl, responsive: false, width: 640, dnt: true });
        vimeo.current = p;
        const iframeFix = () => {
          const f = mount.querySelector("iframe");
          if (f) {
            f.style.width = "100%";
            f.style.height = "100%";
          }
        };
        p.ready().then(iframeFix).catch(() => cb.current.onError?.("Vimeo couldn't play this video here."));
        p.getDuration().then((d: number) => d && cb.current.onDuration?.(d)).catch(() => {});
        p.on("timeupdate", (d: { seconds: number }) => {
          time.current = d.seconds;
          cb.current.onTime?.(d.seconds);
        });
        p.on("seeked", (d: { seconds: number }) => {
          time.current = d.seconds;
          cb.current.onTime?.(d.seconds);
        });
        p.on("play", () => cb.current.onPlayingChange?.(true));
        p.on("pause", () => cb.current.onPlayingChange?.(false));
        p.on("ended", () => cb.current.onPlayingChange?.(false));
      })
      .catch(() => cb.current.onError?.("Couldn't load the Vimeo player."));
    return () => {
      disposed = true;
      void vimeo.current?.destroy?.().catch?.(() => {});
      vimeo.current = null;
      mount.remove();
    };
  }, [platform, sourceUrl]);

  // HTML5: smooth time via requestAnimationFrame while playing.
  useEffect(() => {
    if (platform !== "direct") return;
    const v = videoEl.current;
    if (!v) return;
    let raf = 0;
    const loop = () => {
      time.current = v.currentTime;
      cb.current.onTime?.(v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cb.current.onPlayingChange?.(true);
      raf = requestAnimationFrame(loop);
    };
    const onPause = () => {
      cancelAnimationFrame(raf);
      cb.current.onPlayingChange?.(false);
    };
    const onSeeked = () => {
      time.current = v.currentTime;
      cb.current.onTime?.(v.currentTime);
    };
    const onMeta = () => Number.isFinite(v.duration) && cb.current.onDuration?.(v.duration);
    const onErr = () => cb.current.onError?.("This file couldn't be played in the browser. Check the link is public and the format is MP4/WebM.");
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
    };
  }, [platform]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {platform === "direct" ? (
        <video ref={videoEl} src={sourceUrl} controls playsInline preload="metadata" className="size-full" />
      ) : (
        <div ref={host} className="absolute inset-0 [&_iframe]:size-full" />
      )}
    </div>
  );
});
