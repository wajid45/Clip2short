"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { PLATFORMS, platformLength, type SocialPlatform } from "@/lib/social/types";
import { Button, Input, Label, Notice, Textarea } from "./ui";
import { PLATFORM_LABEL, POST_STATUS } from "./badges";
import { IconExternal } from "./icons";
import { PostActions } from "./post-actions";
import { LocalDateTime } from "./local-time";
import { YouTubeUpload } from "./youtube-upload";
import type { PostingSuggestion } from "./ai-suggestions";

export interface PanelAccount {
  id: string;
  platform: string;
  displayName: string;
  username: string | null;
  status: string;
}

export interface PanelPost {
  id: string;
  platform: string;
  accountName: string;
  status: string;
  text: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  liveUrl: string | null;
  error: string | null;
}

/** Builds the default post text for a platform: caption, then the timestamp link, then hashtags. */
export function composeText(platform: SocialPlatform, caption: string, hashtags: string, link: string): string {
  const tags = hashtags
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `#${t}`);
  return [caption.trim(), platform === "instagram" ? `Watch the full moment: ${link}` : link, tags.join(" ")]
    .filter(Boolean)
    .join("\n\n");
}

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60e3);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostPanel({
  clipId,
  title,
  caption,
  hashtags,
  link,
  accounts,
  posts,
  dirty,
  approvedCopy = null,
}: {
  approvedCopy?: PostingSuggestion | null;
  clipId: string;
  title: string;
  caption: string;
  hashtags: string;
  link: string;
  accounts: PanelAccount[];
  posts: PanelPost[];
  dirty: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const ytChannels = accounts.filter((a) => a.platform === "youtube");
  const linkAccounts = accounts.filter((a) => a.platform !== "youtube");
  const usable = linkAccounts.filter((a) => a.status === "active");
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Keep untouched drafts in sync with the clip's caption.
  const approvedFor = (platform: string): string | null => {
    if (!approvedCopy) return null;
    const t = ({ instagram: approvedCopy.instagram, facebook: approvedCopy.facebook, sandbox: approvedCopy.facebook } as Record<string, string>)[platform];
    if (!t) return null;
    return platform === "instagram" ? `${t}

Watch the full moment: ${link}` : `${t}

${link}`;
  };
  const textFor = (a: PanelAccount) =>
    texts[a.id] ?? approvedFor(a.platform) ?? composeText(a.platform as SocialPlatform, caption, hashtags, link);

  // While anything is publishing, refresh to pick up live links / failure reasons.
  const inFlight = posts.some((p) => p.status === "publishing" || (p.status === "queued" && !p.scheduledAt));
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [inFlight, router]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const overLimit = selected.some((id) => {
    const a = accounts.find((x) => x.id === id)!;
    return platformLength(a.platform as SocialPlatform, textFor(a)) > PLATFORMS[a.platform as SocialPlatform].maxChars;
  });

  async function submit() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const scheduledAt = mode === "schedule" ? new Date(when).toISOString() : null;
      await apiFetch("/api/posts", {
        method: "POST",
        json: {
          clipId,
          scheduledAt,
          targets: selected.map((id) => ({ accountId: id, text: textFor(accounts.find((a) => a.id === id)!) })),
        },
      });
      setFlash(
        mode === "now"
          ? "Publishing now. Live links appear below as each post goes out."
          : `Scheduled for ${new Date(when).toLocaleString()}. It will publish within 15 minutes of that time.`,
      );
      setSelected([]);
      setTexts({});
      router.refresh();
      // A second refresh picks up posts whose first render raced the publish job.
      setTimeout(() => router.refresh(), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {accounts.length === 0 ? (
        <Notice>
          No social accounts connected.{" "}
          <Link href="/app/accounts" className="text-text underline underline-offset-4">
            Connect an account
          </Link>{" "}
          to post this clip.
        </Notice>
      ) : (
        <>
          {ytChannels.length > 0 && (
            <YouTubeUpload
              clipId={clipId}
              channels={ytChannels}
              defaultTitle={title}
              defaultDescription={[caption, `Full video: ${link}`].filter(Boolean).join("\n\n")}
              hashtags={hashtags}
              dirty={dirty}
            />
          )}
          {linkAccounts.length > 0 && (
          <div>
            <Label>{ytChannels.length ? "Also post a link to" : "Post to"}</Label>
            <div className="flex flex-wrap gap-2">
              {linkAccounts.map((a) => {
                const on = selected.includes(a.id);
                const disabled = a.status !== "active";
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(a.id)}
                    className={clsx(
                      "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                      on ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:border-line-strong hover:text-text",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                    title={disabled ? "Reconnect this account on the Social accounts page" : undefined}
                  >
                    <span className="font-medium">{PLATFORM_LABEL[a.platform]}</span>
                    <span className="text-faint">{a.username ? `@${a.username}` : a.displayName}</span>
                  </button>
                );
              })}
            </div>
            {usable.length < linkAccounts.length && <p className="mt-2 text-xs text-draft">Some accounts need reconnecting.</p>}
          </div>
          )}

          {selected.map((id) => {
            const a = accounts.find((x) => x.id === id)!;
            const info = PLATFORMS[a.platform as SocialPlatform];
            const text = textFor(a);
            const len = platformLength(info.id, text);
            return (
              <div key={id}>
                <Label hint={<span className={clsx("tc", len > info.maxChars && "text-danger")}>{len}/{info.maxChars}</span>}>
                  {info.label} · {a.username ? `@${a.username}` : a.displayName}
                </Label>
                <Textarea rows={5} value={text} onChange={(e) => setTexts((t) => ({ ...t, [id]: e.target.value }))} />
                <p className="mt-1.5 text-xs leading-relaxed text-faint">{info.format}</p>
              </div>
            );
          })}

          {selected.length > 0 && (
            <div className="space-y-3">
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(["now", "schedule"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={clsx("h-8 rounded-md px-3 text-sm", mode === m ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
                  >
                    {m === "now" ? "Post now" : "Schedule"}
                  </button>
                ))}
              </div>
              {mode === "schedule" && (
                <div>
                  <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="tc max-w-64" />
                  <p className="mt-1.5 text-xs text-faint">Your time zone: {tz}. Due posts go out within 15 minutes of this time.</p>
                </div>
              )}
              {dirty && <Notice tone="warn">You have unsaved clip changes. Save first so the post uses your latest timecodes.</Notice>}
              <Button variant="primary" onClick={submit} loading={busy} disabled={overLimit || dirty}>
                {mode === "now" ? `Publish to ${selected.length} ${selected.length === 1 ? "account" : "accounts"}` : "Add to queue"}
              </Button>
            </div>
          )}
        </>
      )}
      {flash && <Notice tone="success">{flash}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {posts.length > 0 && (
        <div>
          <h4 className="mb-2 text-[13px] font-medium text-muted">Posts of this clip</h4>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium text-text">{PLATFORM_LABEL[p.platform]}</span>{" "}
                    <span className="text-faint">{p.accountName}</span>{" "}
                    <span className={clsx("ml-1 text-xs font-medium", POST_STATUS[p.status]?.cls)}>{POST_STATUS[p.status]?.label}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {p.publishedAt ? (
                      <>Published <LocalDateTime iso={p.publishedAt} /></>
                    ) : p.status === "failed" ? (
                      "Not published"
                    ) : p.status === "canceled" ? (
                      "Canceled"
                    ) : p.scheduledAt ? (
                      <>Scheduled for <LocalDateTime iso={p.scheduledAt} /></>
                    ) : (
                      "Publishing…"
                    )}
                  </p>
                  {p.error && <p className="mt-1 text-xs text-danger">{p.error}</p>}
                  {p.liveUrl && (
                    <a href={p.liveUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-published hover:underline">
                      View live post <IconExternal size={12} />
                    </a>
                  )}
                </div>
                <PostActions id={p.id} status={p.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
