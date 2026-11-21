import { useRouter, useSearchParams } from "@/lib/nav";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { parseVideoUrl } from "@shortlark/shared/video-source";
import { Button, Notice } from "./ui";
import clsx from "clsx";
import { IconLink, IconPlay } from "@shortlark/shared/components/icons";
import { planWithEngine } from "@shortlark/shared/plans";
import { CATEGORIES, categoryOf, guessCategory, isCategory, type CategoryId } from "@shortlark/shared/categories";
import { PLATFORM_LABEL } from "./badges";
import { Select } from "@shortlark/shared/components/select";

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

export function ImportBox({ disabled, engines }: { disabled?: boolean; engines?: string[] }) {
  const allowed = (id: string) => !engines || engines.includes(id);
  const router = useRouter();
  const params = useSearchParams();
  // A link (and category) picked on the landing page arrives as ?import=…&category=… after sign-up.
  const [url, setUrl] = useState(params.get("import") ?? "");
  const [category, setCategory] = useState<CategoryId | null>(() => {
    const c = params.get("category");
    return isCategory(c) && allowed(c) ? c : null;
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
        if (suggested && !picked && allowed(suggested)) setCategory(suggested);
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

  const step = (n: number, label: string, id?: string) => (
    <p id={id} className="mb-2.5 flex items-center gap-2 text-sm font-medium text-text">
      <span className="num flex size-5 items-center justify-center rounded-full border border-line-strong text-[11px] leading-none text-muted">{n}</span>
      {label}
    </p>
  );

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface">
      <div className="space-y-6 p-5 sm:p-6">
        {/* 1. The link: its title suggests the category */}
        <div>
          {step(1, "Paste the video link")}
          <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-signal focus-within:ring-3 focus-within:ring-signal/20 dark:border-[#4a4b55] dark:bg-surface-2">
            <IconLink className="shrink-0 text-faint" />
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="Paste the YouTube video link"
              className="h-12 w-full min-w-0 bg-transparent text-[15px] text-text placeholder:text-faint focus:outline-none focus-visible:outline-none"
              aria-label="Video link"
              disabled={disabled || loading}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            {parsed && !("error" in parsed) && <span className="shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">{PLATFORM_LABEL[parsed.platform]}</span>}
          </div>
          {preview ? (
            <p className="mt-2 truncate px-1 text-[13px] text-muted">
              <span className="text-text">{preview.title}</span>
              {preview.suggested && !picked && preview.suggested === category && <span className="text-faint"> · category suggested from the title</span>}
            </p>
          ) : invalid && url.length > 8 ? (
            <p className="mt-2 px-1 text-[13px] text-draft">{invalid}</p>
          ) : null}
        </div>

        {/* 2. The category picks the AI engine */}
        <div>
          {step(2, "What kind of video is it?", "category-label")}
          <div role="radiogroup" aria-labelledby="category-label" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                disabled={disabled || loading || !allowed(c.id)}
                title={allowed(c.id) ? undefined : `Comes with the ${planWithEngine(c.id)?.name ?? "Pro"} plan and up`}
                onClick={() => {
                  setCategory(c.id);
                  setPicked(true);
                  setError(null);
                }}
                className={clsx(
                  "h-11 rounded-xl border text-sm transition-colors disabled:opacity-50",
                  category === c.id ? "border-signal bg-surface-2 text-text ring-1 ring-signal" : "border-line bg-surface-2 text-text hover:border-line-strong",
                )}
              >
                {c.label}
                {!allowed(c.id) && <span className="ml-1.5 text-xs text-faint">{planWithEngine(c.id)?.name ?? "Pro"}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2.5 flex min-h-6 flex-wrap items-center gap-2 px-1 text-[13px]">
            {engine ? (
              <span className="text-muted">Looks for {engine.looksFor.toLowerCase()}</span>
            ) : (
              <span className="text-faint">Each kind of video has its own AI engine.</span>
            )}
          </p>
          {engine?.rightsSensitive && (
            <p className="mt-2 rounded-lg border border-draft/30 bg-draft/10 px-3 py-2 text-[13px] text-draft">
              {engine.id === "sports"
                ? "Match broadcasts belong to leagues and broadcasters. Clip only footage you own or have permission to use."
                : "Films and series are protected by their studios. Clip only your own work, or reviews and reactions that follow each network's rules."}
            </p>
          )}
        </div>

        {/* 3. What to look for */}
        <div>
          {step(3, "What should the AI look for?")}
          <Select
            ariaLabel="What the AI looks for"
            className="sm:w-72"
            value={focus}
            onChange={setFocus}
            disabled={disabled || loading}
            options={[
              { value: "auto", label: "Best moments" },
              { value: "events", label: "Main events" },
              { value: "funny", label: "Funniest moments" },
              { value: "insights", label: "Insights and advice" },
            ]}
          />
        </div>

        {error && <Notice tone="error">{error}</Notice>}
      </div>

      {/* The action, with its cost */}
      <div className="flex flex-col-reverse gap-3 rounded-b-2xl border-t border-line bg-surface-2/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[13px] text-muted">1 credit per minute of video · failed analyses are refunded</p>
        <Button type="submit" variant="primary" size="lg" className="h-11 sm:px-6" loading={loading} disabled={disabled || !parsed || !!invalid}>
          {!loading && <IconPlay size={16} />}
          {loading ? "Reading link…" : "Find highlights"}
        </Button>
      </div>
    </form>
  );
}
