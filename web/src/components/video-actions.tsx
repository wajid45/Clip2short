import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Notice } from "./ui";
import { IconPlus, IconSpark, IconTrash } from "@shortlark/shared/components/icons";

export function AnalyzeButton({
  videoId,
  label,
  disabled,
  initialFocus = "auto",
}: {
  videoId: string;
  label: string;
  disabled?: boolean;
  initialFocus?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(initialFocus);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="What the AI looks for"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          disabled={disabled || loading}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-text focus:border-signal focus:outline-none"
        >
          <option value="auto">Best moments</option>
          <option value="events">Main events</option>
          <option value="funny">Funniest</option>
          <option value="insights">Insights</option>
        </select>
        <Button
          size="sm"
          loading={loading}
          disabled={disabled}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await apiFetch(`/api/videos/${videoId}/analyze`, { method: "POST", json: { focus } });
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          <IconSpark size={15} /> {label}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function NewClipButton({ videoId, duration }: { videoId: string; duration: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const end = Math.min(30, duration ?? 30);
          const { id } = await apiFetch<{ id: string }>("/api/clips", {
            method: "POST",
            json: { videoId, title: "New clip", startSec: 0, endSec: Math.max(end, 1) },
          });
          router.push(`/app/clips/${id}`);
        } catch (e) {
          alert((e as Error).message);
          setLoading(false);
        }
      }}
    >
      <IconPlus size={15} /> New clip
    </Button>
  );
}

export function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={loading}
      onClick={async () => {
        if (!confirm("Delete this video and all of its clips and posts history? This can't be undone.")) return;
        setLoading(true);
        try {
          await apiFetch(`/api/videos/${videoId}`, { method: "DELETE" });
          router.push("/app");
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
          setLoading(false);
        }
      }}
    >
      <IconTrash size={15} /> Delete
    </Button>
  );
}
