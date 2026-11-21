import clsx from "clsx";
import { Link } from "@/lib/nav";
import { useRouter } from "@/lib/nav";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/client";
import { formatDuration, formatTimecode, parseTimecode } from "@shortlark/shared/time";
import { timestampUrl } from "@shortlark/shared/video-source";
import { Player, type PlayerHandle } from "./player";
import { DetailTrack, OverviewTrack, type TLClip } from "./editor-timeline";
import { Button, Card, Input, Label, Notice, Textarea } from "./ui";
import { CATEGORY_LABEL, STATUS_META, ScoreBadge } from "./badges";
import { PostPanel, type PanelAccount, type PanelPost } from "./post-panel";
import { AiSuggestions, type ClipField, type PostingSuggestion } from "./ai-suggestions";
import { DownloadClip } from "./download-clip";
import { IconArrowLeft, IconArrowRight, IconPause, IconPlay, IconStepBack, IconStepFwd, IconTrash } from "@shortlark/shared/components/icons";
import { Select } from "@shortlark/shared/components/select";

export interface EditorClip {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  status: string;
  category: string | null;
  hook: string;
  caption: string;
  hashtags: string;
  notes: string;
  transcript: string;
  score: number | null;
  scoreHook: number | null;
  scoreSelf: number | null;
  scorePayoff: number | null;
  scoreQuote: number | null;
  reason: string | null;
  origin: string;
}

export interface EditorVideo {
  id: string;
  title: string;
  platform: string;
  externalId: string | null;
  sourceUrl: string;
  durationSec: number | null;
  captionTiming: string | null;
}

type Fields = Pick<EditorClip, "title" | "startSec" | "endSec" | "status" | "category" | "hook" | "caption" | "hashtags" | "notes">;

const STATUSES = ["idea", "draft", "ready", "published"] as const;

function TimecodeInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(formatTimecode(value, true));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatTimecode(value, true));
  }, [value, focused]);
  return (
    <Input
      aria-label={label}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const v = parseTimecode(text);
        if (v != null) onCommit(Math.round(v * 10) / 10);
        else setText(formatTimecode(value, true));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(formatTimecode(value, true));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="tc h-9 w-28 text-center"
    />
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tc text-text">{value ?? "·"}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-signal" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export function ClipEditor({
  clip,
  video,
  siblings,
  segments,
  accounts,
  posts,
  suggestion,
  canDownload,
}: {
  suggestion: PostingSuggestion | null;
  canDownload: boolean;
  clip: EditorClip;
  video: EditorVideo;
  siblings: TLClip[];
  segments: { start: number; end: number; text: string }[];
  accounts: PanelAccount[];
  posts: PanelPost[];
}) {
  const router = useRouter();
  const player = useRef<PlayerHandle>(null);
  const initial: Fields = useMemo(
    () => ({
      title: clip.title,
      startSec: clip.startSec,
      endSec: clip.endSec,
      status: clip.status,
      category: clip.category,
      hook: clip.hook,
      caption: clip.caption,
      hashtags: clip.hashtags,
      notes: clip.notes,
    }),
    [clip],
  );
  const [saved, setSaved] = useState<Fields>(initial);
  const [f, setF] = useState<Fields>(initial);
  const [playhead, setPlayhead] = useState(clip.startSec);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(video.durationSec ?? 0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const stopAtOut = useRef<number | null>(null);
  const [approvedCopy, setApprovedCopy] = useState<PostingSuggestion | null>(null);

  useEffect(() => {
    setSaved(initial);
    setF(initial);
  }, [initial]);

  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((s) => ({ ...s, [k]: v }));
  const setRange = useCallback((a: number, b: number) => {
    const max = duration || Infinity;
    const start = Math.max(0, Math.min(a, max - 1));
    const end = Math.min(max, Math.max(b, start + 1));
    setF((s) => ({ ...s, startSec: Math.round(start * 10) / 10, endSec: Math.round(end * 10) / 10 }));
  }, [duration]);

  // Seek to the in point once the player is ready.
  useEffect(() => {
    const t = setTimeout(() => player.current?.seek(clip.startSec), 1200);
    return () => clearTimeout(t);
  }, [clip.startSec]);

  // Report the true duration for direct files (and correct stale metadata).
  const onDuration = useCallback(
    (d: number) => {
      setDuration(d);
      if (!video.durationSec || Math.abs(video.durationSec - d) > 2)
        void fetch(apiUrl(`/api/videos/${video.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSec: d }), credentials: "include" });
    },
    [video.durationSec, video.id],
  );

  const onTime = useCallback((t: number) => {
    setPlayhead(t);
    if (stopAtOut.current != null && t >= stopAtOut.current) {
      stopAtOut.current = null;
      player.current?.pause();
    }
  }, []);

  const seek = useCallback((t: number) => player.current?.seek(Math.max(0, duration ? Math.min(t, duration) : t)), [duration]);
  const togglePlay = useCallback(() => {
    if (playing) player.current?.pause();
    else player.current?.play();
  }, [playing]);
  const playClip = useCallback(() => {
    stopAtOut.current = f.endSec;
    player.current?.seek(f.startSec);
    player.current?.play();
  }, [f.startSec, f.endSec]);
  const setInHere = useCallback(() => setRange(Math.min(playhead, f.endSec - 1), f.endSec), [playhead, f.endSec, setRange]);
  const setOutHere = useCallback(() => setRange(f.startSec, Math.max(playhead, f.startSec + 1)), [playhead, f.startSec, setRange]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/clips/${clip.id}`, { method: "PATCH", json: f });
      setSaved(f);
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [clip.id, f, router]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) void save();
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        togglePlay();
      } else if (k === "i") setInHere();
      else if (k === "o") setOutHere();
      else if (k === "j") seek(playhead - 5);
      else if (k === "l") seek(playhead + 5);
      else if (k === "arrowleft") seek(playhead - (e.shiftKey ? 0.1 : 1));
      else if (k === "arrowright") seek(playhead + (e.shiftKey ? 0.1 : 1));
      else if (k === "p") playClip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save, togglePlay, setInHere, setOutHere, seek, playhead, playClip]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const ordered = [...siblings].sort((a, b) => a.startSec - b.startSec);
  const idx = ordered.findIndex((c) => c.id === clip.id);
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];
  const len = f.endSec - f.startSec;
  const excerpt = segments
    .filter((s) => s.end > f.startSec && s.start < f.endSec)
    .map((s) => s.text)
    .join(" ");
  const trackDuration = duration || Math.max(f.endSec + 30, ...siblings.map((s) => s.endSec));

  async function remove() {
    if (!confirm("Delete this clip? Its post history is deleted too.")) return;
    await apiFetch(`/api/clips/${clip.id}`, { method: "DELETE" });
    router.push(`/app/videos/${video.id}`);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/videos/${video.id}`} className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted hover:text-text">
          <IconArrowLeft size={15} className="shrink-0" /> <span className="truncate">{video.title}</span>
        </Link>
        <div className="flex items-center gap-1">
          {prev && (
            <Link href={`/app/clips/${prev.id}`} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text" title="Previous clip in video">
              <IconArrowLeft size={15} />
            </Link>
          )}
          <span className="tc text-xs text-faint">
            {idx + 1}/{ordered.length}
          </span>
          {next && (
            <Link href={`/app/clips/${next.id}`} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text" title="Next clip in video">
              <IconArrowRight size={15} />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: player + timeline + fields */}
        <div className="min-w-0 space-y-5">
          <Player
            ref={player}
            platform={video.platform}
            externalId={video.externalId}
            sourceUrl={video.sourceUrl}
            onTime={onTime}
            onPlayingChange={setPlaying}
            onDuration={onDuration}
            onError={setPlayerError}
          />
          {playerError && <Notice tone="warn">{playerError}</Notice>}

          {/* Transport */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => seek(f.startSec)} title="Jump to in point">
                  <IconStepBack size={15} />
                </Button>
                <Button size="sm" onClick={togglePlay} title="Play/pause (Space)" className="w-10 px-0">
                  {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => seek(f.endSec)} title="Jump to out point">
                  <IconStepFwd size={15} />
                </Button>
              </div>
              <div className="tc text-lg text-text" aria-live="off">
                {formatTimecode(playhead, true)}
                <span className="text-sm text-faint"> / {formatTimecode(trackDuration)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[-5, -1, 1, 5].map((d) => (
                  <Button key={d} size="sm" variant="ghost" onClick={() => seek(playhead + d)} className="tc px-2">
                    {d > 0 ? `+${d}s` : `${d}s`}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="primary" onClick={playClip} title="Play the clip from in to out (P)">
                <IconPlay size={14} /> Play clip
              </Button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(["in", "out"] as const).map((w) => {
                const value = w === "in" ? f.startSec : f.endSec;
                const commit = (v: number) => (w === "in" ? setRange(v, f.endSec) : setRange(f.startSec, v));
                return (
                  <div key={w}>
                    <Label hint={w === "in" ? "Key: I" : "Key: O"}>{w === "in" ? "In point" : "Out point"}</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TimecodeInput value={value} onCommit={commit} label={`${w} point`} />
                      <Button size="sm" onClick={w === "in" ? setInHere : setOutHere}>
                        Set to playhead
                      </Button>
                      <Button size="sm" variant="ghost" className="tc px-2" onClick={() => commit(value - 0.5)}>
                        −.5
                      </Button>
                      <Button size="sm" variant="ghost" className="tc px-2" onClick={() => commit(value + 0.5)}>
                        +.5
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 space-y-5">
              <DetailTrack
                duration={trackDuration}
                inSec={f.startSec}
                outSec={f.endSec}
                playhead={playhead}
                segments={segments}
                onSeek={seek}
                onChange={setRange}
              />
              <OverviewTrack
                duration={trackDuration}
                clips={siblings}
                currentId={clip.id}
                inSec={f.startSec}
                outSec={f.endSec}
                playhead={playhead}
                onSeek={seek}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <span>
                  Clip length <span className={clsx("tc", len > 90 ? "text-draft" : "text-text")}>{formatDuration(len)}</span>
                  {len > 90 && " · most platforms favour clips under 90s"}
                </span>
                <span className="text-faint">Space play · I/O set points · J/L ±5s · ←/→ ±1s (Shift ±0.1s)</span>
              </div>
              {video.captionTiming === "estimated" && (
                <Notice tone="warn">Caption placement for this video is estimated, so check the in and out points by ear.</Notice>
              )}
            </div>
          </Card>

          {/* Content */}
          <Card className="space-y-5 p-5">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <div className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
                {STATUSES.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("status", s)}
                    className={clsx(
                      "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                      f.status === s ? "bg-surface-3 text-text" : "text-muted hover:text-text",
                    )}
                  >
                    <span className={clsx("size-1.5 rounded-full", STATUS_META[s].dot)} />
                    {STATUS_META[s].label}
                    {i < STATUSES.length - 1 && <span className="ml-1 text-faint">→</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  id="category"
                  ariaLabel="Category"
                  value={f.category ?? ""}
                  onChange={(v) => set("category", v || null)}
                  options={[{ value: "", label: "None" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]}
                />
              </div>
              <div>
                <Label htmlFor="hashtags" hint="space separated">Hashtags</Label>
                <Input id="hashtags" value={f.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="podcast startups growth" />
              </div>
            </div>
            <div>
              <Label htmlFor="hook" hint="the opening line viewers hear">Hook</Label>
              <Textarea id="hook" rows={2} value={f.hook} onChange={(e) => set("hook", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="caption" hint="used as the default post text">Caption</Label>
              <Textarea id="caption" rows={3} value={f.caption} onChange={(e) => set("caption", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="notes" hint="private">Notes</Label>
              <Textarea id="notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ideas for b-roll, on-screen text, who to tag…" />
            </div>
            {excerpt && (
              <div>
                <Label>Transcript in this range</Label>
                <p className="scroll-thin max-h-40 overflow-y-auto rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">{excerpt}</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right: save, AI insight, posting */}
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                {dirty ? (
                  <span className="text-draft">Unsaved changes</span>
                ) : savedAt ? (
                  <span className="text-ready">Saved</span>
                ) : (
                  <span className="text-muted">All changes saved</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setF(saved)} disabled={!dirty || saving}>
                  Revert
                </Button>
                <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={!dirty} title="Ctrl/⌘ + S">
                  Save
                </Button>
              </div>
            </div>
            {saveError && (
              <div className="mt-3">
                <Notice tone="error">{saveError}</Notice>
              </div>
            )}
            <p className="mt-3 text-xs text-faint">
              Share link opens the video at{" "}
              <a href={timestampUrl(video, f.startSec)} target="_blank" rel="noreferrer" className="tc text-muted hover:text-text">
                {formatTimecode(f.startSec)}
              </a>
            </p>
          </Card>

          {clip.origin === "ai" && (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <ScoreBadge score={clip.score} size="lg" />
                <div>
                  <p className="text-sm font-medium">Virality score</p>
                  <p className="text-xs text-muted">How likely this works as a standalone short</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ScoreBar label="Hook" value={clip.scoreHook} />
                <ScoreBar label="Stands alone" value={clip.scoreSelf} />
                <ScoreBar label="Payoff" value={clip.scorePayoff} />
                <ScoreBar label="Quotable" value={clip.scoreQuote} />
              </div>
              {clip.reason && (
                <p className="mt-4 text-[13px] leading-relaxed text-muted">
                  <span className="font-medium text-text">Why AI picked it. </span>
                  {clip.reason}
                </p>
              )}
            </Card>
          )}

          <AiSuggestions
            clipId={clip.id}
            initial={suggestion}
            current={{ title: f.title, hook: f.hook, caption: f.caption, hashtags: f.hashtags }}
            approved={approvedCopy !== null}
            onUseField={(k: ClipField, v: string) => set(k, v)}
            onApproveCopy={setApprovedCopy}
            connectedPlatforms={[...new Set(accounts.filter((a) => a.status === "active").map((a) => a.platform))]}
          />

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-medium">Post this clip</h3>
            <PostPanel
              clipId={clip.id}
              title={f.title}
              caption={f.caption || f.hook || f.title}
              hashtags={f.hashtags}
              link={timestampUrl(video, f.startSec)}
              accounts={accounts}
              posts={posts}
              dirty={dirty}
              approvedCopy={approvedCopy}
            />
          </Card>

          <DownloadClip clipId={clip.id} available={canDownload} platform={video.platform} dirty={dirty} />

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={remove}>
              <IconTrash size={15} /> Delete clip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
