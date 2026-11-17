"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Input, Label, Notice } from "./ui";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="tc min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-text">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function IntegrationForm({
  id,
  idLabel,
  secretLabel,
  secretOptional,
  savedClientId,
  hasSavedSecret,
  source,
}: {
  id: string;
  idLabel: string;
  secretLabel: string;
  secretOptional?: boolean;
  savedClientId: string;
  hasSavedSecret: boolean;
  source: "app" | "env" | "none";
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(savedClientId);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      await apiFetch("/api/admin/integrations", { method: "POST", json: { id, clientId, clientSecret: secret || undefined } });
      setSecret("");
      setMsg({ ok: true, text: "Saved. Customers can now connect." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Remove these credentials? New connections will stop working until you add them again.")) return;
    setBusy("remove");
    try {
      await apiFetch("/api/admin/integrations", { method: "DELETE", json: { id } });
      setClientId("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {source === "env" && <Notice>Currently using values from environment variables. Saving here overrides them.</Notice>}
      <div>
        <Label htmlFor={`${id}-cid`}>{idLabel}</Label>
        <Input id={`${id}-cid`} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} className="tc" />
      </div>
      <div>
        <Label htmlFor={`${id}-sec`} hint={hasSavedSecret ? "saved, leave blank to keep" : secretOptional ? "optional" : undefined}>
          {secretLabel}
        </Label>
        <Input
          id={`${id}-sec`}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={hasSavedSecret ? "••••••••••••" : ""}
          autoComplete="new-password"
          className="tc"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} loading={busy === "save"} disabled={!clientId.trim() || !!busy}>
          Save
        </Button>
        {source === "app" && (
          <Button variant="ghost" size="sm" onClick={remove} loading={busy === "remove"} disabled={!!busy}>
            Remove
          </Button>
        )}
      </div>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
    </div>
  );
}
