import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "./ui";

export function DisconnectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={loading}
      onClick={async () => {
        if (!confirm(`Disconnect ${name}? Queued and scheduled posts to it will be canceled. Published history is kept.`)) return;
        setLoading(true);
        try {
          await apiFetch(`/api/social/accounts/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
          setLoading(false);
        }
      }}
    >
      Disconnect
    </Button>
  );
}
