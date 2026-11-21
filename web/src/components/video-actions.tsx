import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Notice } from "./ui";
import { IconPlus, IconSpark, IconTrash } from "@shortlark/shared/components/icons";
import { Select } from "@shortlark/shared/components/select";

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
        <Select
          ariaLabel="What the AI looks for"
          size="sm"
          className="w-40"
          value={focus}
          onChange={setFocus}
          disabled={disabled || loading}
          options={[
            { value: "auto", label: "Best moments" },
            { value: "events", label: "Main events" },
            { value: "funny", label: "Funniest" },
            { value: "insights", label: "Insights" },
          ]}
        />
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
