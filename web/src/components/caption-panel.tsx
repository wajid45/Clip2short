import clsx from "clsx";
import { useRouter } from "@/lib/nav";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Notice, Spinner, Textarea } from "./ui";
import { IconRefresh } from "@shortlark/shared/components/icons";

export interface CaptionInfo {
  status: string;
  source: string | null;
  timing: string | null;
  note: string | null;
  segmentCount: number;
}

function sourceLabel(source: string | null): string {
  if (!source) return "—";
  const [kind, a, b] = source.split(":");
  if (kind === "youtube") {
    if (a === "manual") return `YouTube · creator captions (${b})`;
    if (a === "asr") return `YouTube · auto-generated (${b})`;
    if (a === "translated") return "YouTube · auto-translated to English";
  }
  if (kind === "vimeo") return `Vimeo · text track (${b})`;
  if (kind === "agent") return "AI fetch agent";
  if (kind === "paste") return a === "timed" ? "Your pasted transcript (timestamped)" : "Your pasted transcript (no timestamps)";
  if (kind === "direct") return "Caption file next to the video";
  return source;
}

export function CaptionPanel({ videoId, info }: { videoId: string; info: CaptionInfo }) {
  const router = useRouter();
  const needsTranscript = info.status === "missing" || info.status === "failed";
  const [pasting, setPasting] = useState(needsTranscript);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"refetch" | "paste" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Open the paste box as soon as automatic fetching gives up.
  useEffect(() => {
    if (needsTranscript) setPasting(true);
  }, [needsTranscript]);

  async function refetch() {
    setBusy("refetch");
    setError(null);
    try {
      await apiFetch(`/api/videos/${videoId}/captions`, { method: "POST", json: { action: "refetch" } });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function paste() {
    setBusy("paste");
    setError(null);
    try {
      await apiFetch(`/api/videos/${videoId}/captions`, { method: "POST", json: { action: "paste", transcript: text } });
      setText("");
      setPasting(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const exact = info.timing === "exact";
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text">Captions</h3>
          {info.status === "pending" ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-signal">
              <Spinner /> Trying every caption source…
            </p>
          ) : info.status === "ready" ? (
            <p className="mt-1 text-sm text-muted">
              {sourceLabel(info.source)} · <span className="tc">{info.segmentCount}</span> lines
            </p>
          ) : (
            <p className="mt-1 text-sm text-draft">No captions found yet</p>
          )}
        </div>
        {info.status === "ready" && (
          <span
            className={clsx(
              "shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
              exact ? "border-ready/40 text-ready" : "border-draft/40 text-draft",
            )}
            title={exact ? "Clip in/out points come from real caption timings." : "Placement is estimated from word count."}
          >
            {exact ? "Exact timings" : "Estimated placement"}
          </span>
        )}
      </div>

      {info.note && info.status !== "pending" && (
        <p className={clsx("text-[13px] leading-relaxed", info.status === "ready" ? "text-faint" : "text-muted")}>{info.note}</p>
      )}

      {info.status !== "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={refetch} loading={busy === "refetch"} disabled={!!busy}>
            <IconRefresh size={15} /> Fetch again
          </Button>
          {!pasting && (
            <Button size="sm" variant="ghost" onClick={() => setPasting(true)}>
              {info.status === "ready" ? "Replace with my transcript" : "Paste transcript"}
            </Button>
          )}
        </div>
      )}

      {pasting && info.status !== "pending" && (
        <div className="space-y-2">
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste an SRT/VTT file, YouTube's \"Show transcript\" text (with timestamps), or plain text.\n\n0:00 Welcome back to the show…\n0:07 Today we're talking about…"}
            className="tc text-[13px]"
          />
          <p className="text-xs text-faint">
            With timestamps, clips land exactly. Plain text works too; placement is then estimated and shown as such.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={paste} loading={busy === "paste"} disabled={text.trim().length < 50 || !!busy}>
              Use transcript and find moments
            </Button>
            {info.status === "ready" && (
              <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
