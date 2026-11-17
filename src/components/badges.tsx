import clsx from "clsx";

export const STATUS_META: Record<string, { label: string; dot: string; text: string; bar: string }> = {
  idea: { label: "Idea", dot: "bg-idea", text: "text-idea", bar: "bg-idea" },
  draft: { label: "Draft", dot: "bg-draft", text: "text-draft", bar: "bg-draft" },
  ready: { label: "Ready", dot: "bg-ready", text: "text-ready", bar: "bg-ready" },
  published: { label: "Published", dot: "bg-published", text: "text-published", bar: "bg-published" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.idea;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", m.text, className)}>
      <span className={clsx("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function scoreTone(score: number | null | undefined) {
  if (score == null) return "text-faint border-line";
  if (score >= 85) return "text-ready border-ready/40 bg-ready/10";
  if (score >= 70) return "text-text border-line-strong bg-surface-3";
  return "text-draft border-draft/30 bg-draft/10";
}

export function ScoreBadge({ score, size = "md" }: { score: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      title="Virality score (0–100)"
      className={clsx(
        "tc inline-flex items-center justify-center rounded-md border font-semibold",
        size === "sm" && "h-6 min-w-8 px-1.5 text-xs",
        size === "md" && "h-7 min-w-10 px-2 text-[13px]",
        size === "lg" && "h-10 min-w-14 px-3 text-lg",
        scoreTone(score),
      )}
    >
      {score ?? "—"}
    </span>
  );
}

export const CATEGORY_LABEL: Record<string, string> = {
  insight: "Insight",
  story: "Story",
  humor: "Humor",
  "hot-take": "Hot take",
  "how-to": "How-to",
  emotional: "Emotional",
  data: "Data point",
  quote: "Quote",
  event: "Main event",
};

export function CategoryTag({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span className="inline-flex h-6 items-center rounded-md bg-surface-3 px-2 text-xs text-muted">
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  direct: "File link",
  instagram: "Instagram",
  facebook: "Facebook",
  sandbox: "Sandbox",
};

export const POST_STATUS: Record<string, { label: string; cls: string }> = {
  uploading: { label: "Uploading", cls: "text-signal" },
  queued: { label: "Queued", cls: "text-muted" },
  scheduled: { label: "Scheduled", cls: "text-draft" },
  publishing: { label: "Publishing", cls: "text-signal" },
  published: { label: "Live", cls: "text-ready" },
  failed: { label: "Failed", cls: "text-danger" },
  canceled: { label: "Canceled", cls: "text-faint" },
};
