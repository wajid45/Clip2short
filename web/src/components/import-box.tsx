import { useRouter } from "@/lib/nav";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { parseVideoUrl } from "@shortlark/shared/video-source";
import { Button, Notice } from "./ui";
import { IconLink } from "@shortlark/shared/components/icons";
import { PLATFORM_LABEL } from "./badges";

/** Reads a direct file's duration in the browser (the server never downloads the video). */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const done = (d: number | null) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 10000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

export function ImportBox({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState("auto");
  const parsed = useMemo(() => (url.trim() ? parseVideoUrl(url) : null), [url]);
  const invalid = parsed && "error" in parsed ? parsed.error : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed || "error" in parsed) return;
    setLoading(true);
    setError(null);
    try {
      const clientDuration = parsed.platform === "direct" ? await probeDuration(parsed.canonicalUrl) : null;
      const { id } = await apiFetch<{ id: string }>("/api/videos", { method: "POST", json: { url, clientDuration, focus } });
      router.push(`/app/videos/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2 transition-colors focus-within:border-signal sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5">
          <IconLink className="shrink-0 text-faint" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            placeholder="Paste a YouTube, Vimeo or .mp4 / .webm link"
            className="h-11 w-full min-w-0 bg-transparent text-[15px] text-text placeholder:text-faint focus:outline-none"
            aria-label="Video link"
            disabled={disabled || loading}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
          {parsed && !("error" in parsed) && (
            <span className="hidden shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted sm:inline">
              {PLATFORM_LABEL[parsed.platform]}
            </span>
          )}
        </div>
        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={disabled || !parsed || !!invalid}>
          {loading ? "Reading link…" : "Find moments"}
        </Button>
      </div>
      <div className="mt-2 flex min-h-5 flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {invalid && url.length > 8 && <p className="text-sm text-draft">{invalid}</p>}
          {!invalid && !error && <p className="text-sm text-faint">Title, length and description are read from the link.</p>}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
          AI looks for
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            disabled={disabled || loading}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-text focus:border-signal focus:outline-none"
          >
            <option value="auto">Best moments</option>
            <option value="events">Main events</option>
            <option value="funny">Funniest moments</option>
            <option value="insights">Insights and advice</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </form>
  );
}
