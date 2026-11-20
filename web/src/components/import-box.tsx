import { useRouter, useSearchParams } from "@/lib/nav";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { parseVideoUrl } from "@shortlark/shared/video-source";
import { Button, Notice } from "./ui";
import clsx from "clsx";
import { IconLink, IconPlay } from "@shortlark/shared/components/icons";
import { CATEGORIES, categoryOf, guessCategory, isCategory, type CategoryId } from "@shortlark/shared/categories";
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
  const params = useSearchParams();
  // A link (and category) picked on the landing page arrives as ?import=…&category=… after sign-up.
  const [url, setUrl] = useState(params.get("import") ?? "");
  const [category, setCategory] = useState<CategoryId | null>(() => {
    const c = params.get("category");
    return isCategory(c) ? c : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState("auto");
  const parsed = useMemo(() => (url.trim() ? parseVideoUrl(url) : null), [url]);
  const invalid = parsed && "error" in parsed ? parsed.error : null;
  const engine = category ? categoryOf(category) : null;
  // The user's own pick always wins over a suggestion.
  const [picked, setPicked] = useState(() => isCategory(params.get("category")));
  const [preview, setPreview] = useState<{ title: string; suggested: CategoryId | null } | null>(null);

  // Once the link is valid, read its title and suggest a category from it.
  useEffect(() => {
    setPreview(null);
    if (!parsed || "error" in parsed) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const meta = await apiFetch<{ title: string; author: string | null; description: string }>("/api/videos/preview", { method: "POST", json: { url } });
        if (cancelled) return;
        const suggested = guessCategory(`${meta.title} ${meta.author ?? ""} ${meta.description}`);
        setPreview({ title: meta.title, suggested });
        if (suggested && !picked) setCategory(suggested);
      } catch {
        /* the import itself reports link problems */
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed && !("error" in parsed) ? parsed.canonicalUrl : null]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed || "error" in parsed) return;
    if (!category) {
      setError("Choose what kind of video this is first, so the right AI engine looks for its highlights.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const clientDuration = parsed.platform === "direct" ? await probeDuration(parsed.canonicalUrl) : null;
      const { id } = await apiFetch<{ id: string }>("/api/videos", { method: "POST", json: { url, clientDuration, focus, category } });
      router.push(`/app/videos/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      {/* 1. Category */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="category-label" className="text-[12px] font-semibold tracking-wide text-muted uppercase">
          1. Choose the video category
        </p>
        <div role="radiogroup" aria-labelledby="category-label" className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              disabled={disabled || loading}
              onClick={() => {
                setCategory(c.id);
                setPicked(true);
                setError(null);
              }}
              className={clsx(
                "h-9 rounded-lg border px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
                category === c.id ? "border-signal bg-signal text-on-signal" : "border-line bg-surface-2 text-text hover:border-line-strong",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Link */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-bg px-3 transition-colors focus-within:border-signal">
          <IconLink className="shrink-0 text-faint" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            placeholder="Paste a YouTube, Vimeo or .mp4 / .webm link"
            className="h-12 w-full min-w-0 bg-transparent text-[15px] text-text placeholder:text-faint focus:outline-none focus-visible:outline-none"
            aria-label="Video link"
            disabled={disabled || loading}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
          {parsed && !("error" in parsed) && (
            <span className="hidden shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted sm:inline">{PLATFORM_LABEL[parsed.platform]}</span>
          )}
        </div>
        <Button type="submit" variant="primary" size="lg" className="h-12 sm:px-6" loading={loading} disabled={disabled || !parsed || !!invalid}>
          {!loading && <IconPlay size={16} />}
          {loading ? "Reading link…" : "Find highlights"}
        </Button>
      </div>

      {preview && (
        <p className="mt-2 truncate px-1 text-[13px] text-muted">
          <span className="text-text">{preview.title}</span>
          {preview.suggested && !picked && preview.suggested === category && <span className="text-faint"> · category suggested from the title, change it if it's wrong</span>}
        </p>
      )}
      {engine?.rightsSensitive && (
        <p className="mt-3 rounded-lg border border-draft/30 bg-draft/10 px-3 py-2 text-[13px] text-draft">
          {engine.id === "sports"
            ? "Match broadcasts belong to leagues and broadcasters. Clip only footage you own or have permission to use."
            : "Films and series are protected by their studios. Clip only your own work, or reviews and reactions that follow each network's rules."}
        </p>
      )}

      {/* Engine + options */}
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {engine ? (
            <>
              <span className="rounded-md border border-signal/40 bg-signal-soft px-2 py-0.5 text-[13px] font-medium text-signal">{engine.engine}</span>
              <span className="text-muted">{engine.looksFor}</span>
            </>
          ) : invalid && url.length > 8 ? (
            <span className="text-draft">{invalid}</span>
          ) : (
            <span className="text-faint">Each category has its own AI engine, tuned for that kind of video.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm text-muted">
          <label className="flex items-center gap-2">
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
          <span className="text-faint">1 credit per minute of video</span>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </form>
  );
}
