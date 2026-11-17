"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import { formatDuration } from "@/lib/time";
import { Button, Input, Label, Notice, Textarea } from "./ui";
import { PlatformIcon } from "./platform-icon";

interface Channel {
  id: string;
  displayName: string;
  username: string | null;
  status: string;
}

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60e3);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reads duration and orientation locally so we can say whether YouTube will treat it as a Short. */
function probe(file: File): Promise<{ duration: number; vertical: boolean } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (r: { duration: number; vertical: boolean } | null) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    v.onloadedmetadata = () => done({ duration: v.duration, vertical: v.videoHeight >= v.videoWidth });
    v.onerror = () => done(null);
    v.src = url;
  });
}

/**
 * Upload a clip file to one or more YouTube channels. The file is sent in chunks through
 * our server straight into YouTube; scheduling uses YouTube's own publish time.
 */
export function YouTubeUpload({
  clipId,
  channels,
  defaultTitle,
  defaultDescription,
  hashtags,
  dirty,
}: {
  clipId: string;
  channels: Channel[];
  defaultTitle: string;
  defaultDescription: string;
  hashtags: string;
  dirty: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<{ duration: number; vertical: boolean } | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [kids, setKids] = useState<"no" | "yes" | "">("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState(defaultScheduleValue);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cancelled = useRef(false);

  const isShort = info ? info.vertical && info.duration <= 180 : null;
  const tags = useMemo(() => hashtags.split(/\s+/).filter(Boolean), [hashtags]);
  const t = title ?? `${defaultTitle}${isShort && !/#shorts/i.test(defaultTitle) ? " #Shorts" : ""}`.slice(0, 100);
  const d = description ?? defaultDescription;

  useEffect(() => {
    if (!file) return setInfo(null);
    void probe(file).then(setInfo);
  }, [file]);

  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  async function uploadTo(channelId: string, f: File) {
    const scheduledAt = mode === "schedule" ? new Date(when).toISOString() : null;
    const { postId, chunkSize } = await apiFetch<{ postId: string; chunkSize: number }>("/api/youtube/uploads", {
      method: "POST",
      json: {
        clipId,
        accountId: channelId,
        title: t,
        description: d,
        tags,
        privacy,
        madeForKids: kids === "yes",
        scheduledAt,
        size: f.size,
        mimeType: f.type || "video/mp4",
      },
    });
    let offset = 0;
    let retries = 0;
    while (offset < f.size) {
      if (cancelled.current) {
        await fetch(`/api/posts/${postId}`, { method: "DELETE" });
        throw new Error("Upload cancelled.");
      }
      const chunk = f.slice(offset, Math.min(offset + chunkSize, f.size));
      const res = await fetch(`/api/youtube/uploads/${postId}?offset=${offset}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503 && retries < 4) {
          retries++;
          await new Promise((r) => setTimeout(r, 1500 * retries));
          continue;
        }
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      retries = 0;
      if (body.done) {
        setProgress((p) => ({ ...p, [channelId]: 100 }));
        return body as { url: string; scheduled: boolean };
      }
      offset = typeof body.received === "number" && body.received > offset ? body.received : offset + chunk.size;
      setProgress((p) => ({ ...p, [channelId]: Math.round((offset / f.size) * 100) }));
    }
    throw new Error("Upload ended unexpectedly.");
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    cancelled.current = false;
    try {
      for (const id of selected) await uploadTo(id, file);
      setDone(
        mode === "schedule"
          ? "Uploaded and scheduled. YouTube will publish it at the chosen time."
          : "Uploaded. YouTube is processing the video; it's live on your channel now and HD finishes shortly.",
      );
      setFile(null);
      setSelected([]);
      setProgress({});
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-line p-4">
      <div className="flex items-center gap-2.5">
        <PlatformIcon platform="youtube" size={24} />
        <h4 className="text-sm font-medium">Upload to YouTube</h4>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        YouTube needs the actual clip file. Export the in/out range from your editor (or phone) and drop it here. Vertical videos up
        to 3 minutes become Shorts.
      </p>

      <div className="flex flex-wrap gap-2">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={c.status !== "active" || busy}
            onClick={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
            className={clsx(
              "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50",
              selected.includes(c.id) ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:text-text",
            )}
          >
            {c.displayName}
            {c.username && <span className="text-faint">@{c.username}</span>}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <>
          <label
            className={clsx(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors",
              file ? "border-line-strong" : "border-line hover:border-line-strong",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f?.type.startsWith("video/")) setFile(f);
            }}
          >
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <span className="font-medium text-text">{file.name}</span>
                <span className="tc text-xs text-muted">
                  {(file.size / 1024 ** 2).toFixed(1)} MB
                  {info && ` · ${formatDuration(info.duration)} · ${info.vertical ? "vertical" : "horizontal"}`}
                </span>
                {isShort != null && (
                  <span className={clsx("text-xs", isShort ? "text-ready" : "text-draft")}>
                    {isShort ? "Will appear as a Short" : "Will appear as a regular video (Shorts must be vertical and 3 minutes or less)"}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-text">Drop the clip file here or click to choose</span>
                <span className="text-xs text-faint">MP4, MOV or WebM</span>
              </>
            )}
          </label>

          <div>
            <Label hint={<span className="tc">{t.length}/100</span>}>Title</Label>
            <Input value={t} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label hint={<span className="tc">{d.length}/5000</span>}>Description</Label>
            <Textarea rows={4} value={d} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Visibility</Label>
              <select
                value={mode === "schedule" ? "public" : privacy}
                disabled={mode === "schedule"}
                onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-text focus:border-signal focus:outline-none disabled:opacity-60"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div>
              <Label hint="required by YouTube">Made for kids?</Label>
              <select
                value={kids}
                onChange={(e) => setKids(e.target.value as typeof kids)}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-text focus:border-signal focus:outline-none"
              >
                <option value="">Choose…</option>
                <option value="no">No, it&apos;s not made for kids</option>
                <option value="yes">Yes, it&apos;s made for kids</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="inline-flex rounded-lg border border-line p-0.5">
              {(["now", "schedule"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={clsx("h-8 rounded-md px-3 text-sm", mode === m ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
                >
                  {m === "now" ? "Publish now" : "Schedule"}
                </button>
              ))}
            </div>
            {mode === "schedule" && (
              <div>
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="tc max-w-64" />
                <p className="mt-1.5 text-xs text-faint">Uploads now as private; YouTube makes it public at this time.</p>
              </div>
            )}
          </div>

          {Object.keys(progress).length > 0 && (
            <div className="space-y-2">
              {selected.map((id) => (
                <div key={id}>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{channels.find((c) => c.id === id)?.displayName}</span>
                    <span className="tc">{progress[id] ?? 0}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${progress[id] ?? 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {dirty && <Notice tone="warn">Save your clip changes first so the title and description match.</Notice>}
          <div className="flex gap-2">
            <Button variant="primary" onClick={submit} loading={busy} disabled={!file || !kids || dirty || !t.trim()}>
              {busy ? "Uploading…" : mode === "now" ? "Upload & publish" : "Upload & schedule"}
            </Button>
            {busy && (
              <Button variant="ghost" onClick={() => (cancelled.current = true)}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
      {done && <Notice tone="success">{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
