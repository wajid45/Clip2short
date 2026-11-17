"use client";

import { useState } from "react";
import { Card, Notice, buttonClass } from "./ui";
import { IconDownload } from "./icons";

/** Download the clip as an MP4 instead of posting through Shortlark. */
export function DownloadClip({ clipId, available, platform, dirty }: { clipId: string; available: boolean; platform: string; dirty: boolean }) {
  const [started, setStarted] = useState<string | null>(null);
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <IconDownload size={15} /> Download clip
      </h3>
      {available ? (
        <>
          <p className="mt-1 text-xs text-muted">Get the cut as an MP4 to post yourself or edit further. Rendering a 60-second clip takes about half a minute.</p>
          {dirty && (
            <div className="mt-3">
              <Notice tone="warn">Save your changes first so the download uses your latest in and out points.</Notice>
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { f: "original", l: "Original shape" },
              { f: "vertical", l: "Vertical 9:16" },
            ].map(({ f, l }) => (
              <a
                key={f}
                href={dirty ? undefined : `/api/clips/${clipId}/download?format=${f}`}
                aria-disabled={dirty}
                onClick={(e) => {
                  if (dirty) e.preventDefault();
                  else setStarted(l);
                }}
                className={buttonClass(f === "vertical" ? "primary" : "secondary", "sm", dirty ? "pointer-events-none opacity-50" : "")}
              >
                {l}
              </a>
            ))}
          </div>
          {started && <p className="mt-3 text-xs text-faint">Preparing “{started}”. Your browser will save the MP4 when it&apos;s ready.</p>}
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {platform === "youtube" ? "YouTube" : "Vimeo"} doesn&apos;t allow downloading its videos, so Shortlark can&apos;t cut a file from this source.
          Import a direct link to your original .mp4 or .webm to download clips, or use the exported timecodes in your own editor.
        </p>
      )}
    </Card>
  );
}
