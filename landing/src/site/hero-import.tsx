import { useMemo, useState } from "react";
import { parseVideoUrl } from "@shortlark/shared/video-source";
import { IconLink } from "@shortlark/shared/components/icons";
import { appHref } from "../config";

/** Paste a link, sign up, and land in the app with the link ready to import (the category is picked there). */
export function HeroImport() {
  const [url, setUrl] = useState("");
  const parsed = useMemo(() => (url.trim() ? parseVideoUrl(url) : null), [url]);
  const error = parsed && "error" in parsed ? parsed.error : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    window.location.href = appHref(link && !error ? `/signup?import=${encodeURIComponent(link)}` : "/signup");
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface/90 p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] backdrop-blur transition-colors focus-within:border-signal sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
          <IconLink className="shrink-0 text-faint" />
          <span className="sr-only">Video link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste the YouTube video link"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full min-w-0 bg-transparent text-[15px] text-text placeholder:text-faint focus:outline-none focus-visible:outline-none"
          />
        </label>
        <button type="submit" className="h-12 shrink-0 rounded-xl bg-signal px-6 text-[15px] font-medium text-on-signal transition-colors hover:bg-signal-strong">
          Find my clips
        </button>
      </div>
      {error && <p className="mt-2.5 px-1 text-[13px] text-danger">{error}</p>}
    </form>
  );
}
