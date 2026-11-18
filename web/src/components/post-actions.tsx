import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "./ui";

/** Post now / Retry / Cancel controls for a single post (queue page and clip editor). */
export function PostActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"now" | "cancel" | null>(null);

  async function run(kind: "now" | "cancel") {
    if (kind === "cancel" && !confirm("Cancel this post? It won't be published.")) return;
    setBusy(kind);
    try {
      await apiFetch(`/api/posts/${id}`, { method: kind === "now" ? "POST" : "DELETE" });
      router.refresh();
      if (kind === "now") setTimeout(() => router.refresh(), 4000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!["queued", "scheduled", "failed"].includes(status)) return null;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant={status === "failed" ? "secondary" : "ghost"} loading={busy === "now"} disabled={!!busy} onClick={() => run("now")}>
        {status === "failed" ? "Retry" : "Post now"}
      </Button>
      <Button size="sm" variant="ghost" loading={busy === "cancel"} disabled={!!busy} onClick={() => run("cancel")}>
        Cancel
      </Button>
    </div>
  );
}
