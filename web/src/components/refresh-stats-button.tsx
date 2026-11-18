import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "./ui";
import { IconRefresh } from "@shortlark/shared/components/icons";

export function RefreshStatsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <Button
        size="sm"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setMsg(null);
          try {
            const r = await apiFetch<{ refreshed: number }>("/api/analytics/refresh", { method: "POST" });
            setMsg(`Updated ${r.refreshed} ${r.refreshed === 1 ? "post" : "posts"}`);
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <IconRefresh size={15} /> Refresh stats
      </Button>
    </div>
  );
}
