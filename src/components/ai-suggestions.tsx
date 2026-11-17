"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Card, Notice } from "./ui";
import { PlatformIcon } from "./platform-icon";
import { IconCheck, IconSpark } from "./icons";

export interface PostingSuggestion {
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  youtube_title: string;
  youtube_description: string;
  instagram: string;
  facebook: string;
  rationale: string;
  createdAt?: string;
}

export type ClipField = "title" | "hook" | "caption" | "hashtags";

const PLATFORM_ROWS: { id: string; label: string; get: (s: PostingSuggestion) => string }[] = [
  { id: "youtube", label: "YouTube", get: (s) => `${s.youtube_title}\n\n${s.youtube_description}` },
  { id: "instagram", label: "Instagram", get: (s) => s.instagram },
  { id: "facebook", label: "Facebook", get: (s) => s.facebook },
  // Development-only sandbox account posts the Facebook-style text.
  { id: "sandbox", label: "Sandbox", get: (s) => s.facebook },
];

/**
 * AI-written posting copy, shown for review. Nothing changes until the user clicks
 * "Use" on a field or "Approve for posting"; clip fields still need Save afterwards.
 */
export function AiSuggestions({
  clipId,
  initial,
  current,
  approved,
  onUseField,
  onApproveCopy,
  connectedPlatforms,
}: {
  connectedPlatforms: string[];
  clipId: string;
  initial: PostingSuggestion | null;
  current: Record<ClipField, string>;
  approved: boolean;
  onUseField: (field: ClipField, value: string) => void;
  onApproveCopy: (s: PostingSuggestion) => void;
}) {
  const [s, setS] = useState<PostingSuggestion | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ suggestion: PostingSuggestion }>(`/api/clips/${clipId}/suggest`, { method: "POST" });
      setS(r.suggestion);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = PLATFORM_ROWS.filter((p) => connectedPlatforms.includes(p.id));
  const fields: { key: ClipField; label: string; value: string }[] = s
    ? [
        { key: "title", label: "Title", value: s.title },
        { key: "hook", label: "Hook", value: s.hook },
        { key: "caption", label: "Caption", value: s.caption },
        { key: "hashtags", label: "Hashtags", value: s.hashtags.join(" ") },
      ]
    : [];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <IconSpark size={15} className="text-signal" /> AI posting copy
          </h3>
          <p className="mt-1 text-xs text-muted">Titles, captions and descriptions for each network. Review, then approve what you like.</p>
        </div>
        <Button size="sm" variant={s ? "ghost" : "primary"} onClick={generate} loading={busy}>
          {s ? "Regenerate" : "Suggest"} · 1 credit
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {s && (
        <div className="mt-5 space-y-5">
          {s.rationale && <p className="text-xs leading-relaxed text-faint">{s.rationale}</p>}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">Clip details</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fields.forEach((f) => onUseField(f.key, f.value))}
                disabled={fields.every((f) => current[f.key] === f.value)}
              >
                Use all
              </Button>
            </div>
            <ul className="space-y-2">
              {fields.map((f) => {
                const used = current[f.key] === f.value;
                return (
                  <li key={f.key} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-faint">{f.label}</p>
                        <p className="mt-0.5 text-sm break-words text-text">{f.key === "hashtags" ? f.value.split(" ").map((h) => `#${h}`).join(" ") : f.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUseField(f.key, f.value)}
                        disabled={used}
                        className={clsx(
                          "shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          used ? "text-ready" : "text-signal hover:bg-signal-soft",
                        )}
                      >
                        {used ? (
                          <span className="inline-flex items-center gap-1">
                            <IconCheck size={13} /> Used
                          </span>
                        ) : (
                          "Use"
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Post text for your accounts</p>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs leading-relaxed text-muted">
                Connect a social account to get post text written for it.{" "}
                <Link href="/app/accounts" className="font-medium text-text underline underline-offset-4">
                  Connect accounts
                </Link>
              </p>
            ) : (
              <>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {rows.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(open === p.id ? null : p.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                        aria-expanded={open === p.id}
                      >
                        <PlatformIcon platform={p.id} size={22} className="ring-0" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text">{p.get(s).split("\n")[0]}</span>
                        <span className="text-xs text-faint">{open === p.id ? "Hide" : "View"}</span>
                      </button>
                      {open === p.id && <p className="px-3 pb-3 text-[13px] leading-relaxed whitespace-pre-line text-muted">{p.get(s)}</p>}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-faint">The timestamp link is added automatically when you post.</p>
                  <Button size="sm" variant={approved ? "ghost" : "primary"} onClick={() => onApproveCopy(s)} disabled={approved}>
                    {approved ? (
                      <span className="inline-flex items-center gap-1">
                        <IconCheck size={14} /> Approved
                      </span>
                    ) : (
                      "Approve for posting"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
