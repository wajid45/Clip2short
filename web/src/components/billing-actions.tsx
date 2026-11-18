import { useRouter } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Notice } from "./ui";

export function ChoosePlanButton({
  plan,
  mode,
  highlight,
  label,
}: {
  plan: string;
  mode: "stripe" | "dev" | "unavailable";
  highlight?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      if (mode === "dev") {
        await apiFetch("/api/billing/dev-activate", { method: "POST", json: { plan } });
        router.push("/app?welcome=1");
        router.refresh();
        return;
      }
      const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", { method: "POST", json: { plan } });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant={highlight ? "primary" : "secondary"}
        className="w-full"
        loading={loading}
        disabled={mode === "unavailable"}
        onClick={go}
      >
        {label}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const { url } = await apiFetch<{ url: string }>("/api/billing/portal", { method: "POST" });
            window.location.href = url;
          } catch (e) {
            setError((e as Error).message);
            setLoading(false);
          }
        }}
      >
        Manage billing
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function DevCancelButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await apiFetch("/api/billing/dev-activate", { method: "POST", json: { plan: "none" } });
        router.refresh();
        setLoading(false);
      }}
    >
      Cancel plan (dev)
    </Button>
  );
}

export function BuyPackButton({ pack, label, highlight }: { pack: string; label: string; highlight?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={highlight ? "primary" : "secondary"}
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const { url } = await apiFetch<{ url: string }>("/api/billing/credits", { method: "POST", json: { pack } });
            if (url.startsWith("/")) {
              router.push(url);
              router.refresh();
              setLoading(false);
            } else window.location.href = url;
          } catch (e) {
            setError((e as Error).message);
            setLoading(false);
          }
        }}
      >
        {label}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
