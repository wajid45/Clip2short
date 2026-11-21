import { useState } from "react";
import type { IntegrationsData } from "@shortlark/shared/api-types";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { IconExternal } from "@shortlark/shared/components/icons";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from "../../components/ui";
import { useToast } from "../../components/toast";
import { api, useLive } from "../../lib/api";

type Integration = IntegrationsData["integrations"][number];

function CopyField({ value }: { value: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2">
      <code className="tc min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-text">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast("Copied");
        }}
      >
        Copy
      </Button>
    </div>
  );
}

/** One network's developer app: what to register, and its app ID and secret. */
function IntegrationCard({ i, onChange }: { i: Integration; onChange: () => void }) {
  const [clientId, setClientId] = useState(i.savedClientId);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const toast = useToast();

  async function save() {
    setBusy("save");
    try {
      await api("/integrations", { body: { id: i.id, clientId: clientId.trim(), clientSecret: secret || undefined } });
      setSecret("");
      toast(`${i.name} saved. Customers can connect now.`);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Remove the ${i.name} credentials? New connections stop working until you add them again.`)) return;
    setBusy("remove");
    try {
      await api("/integrations", { method: "DELETE", body: { id: i.id } });
      setClientId("");
      toast(`${i.name} credentials removed.`);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5">
              {i.platforms.map((p) => (
                <PlatformIcon key={p} platform={p} size={28} />
              ))}
            </div>
            <h2 className="text-[17px] font-medium text-text">{i.name}</h2>
            <Badge tone={i.live ? "success" : "neutral"} className="ml-auto">
              {i.live ? "Live" : "Not set up"}
            </Badge>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            <span className="num text-text">{i.connectedAccounts}</span> connected {i.connectedAccounts === 1 ? "account" : "accounts"}
            {i.source === "env" && " · using values from the server environment"}
          </p>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            {i.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a href={i.consoleUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-signal hover:underline">
            Open developer console <IconExternal size={13} />
          </a>
          <div className="mt-5 space-y-2">
            <p className="text-xs text-muted">Redirect URI{i.redirectUris.length > 1 ? "s" : ""} to register</p>
            {i.redirectUris.map((uri) => (
              <CopyField key={uri} value={uri} />
            ))}
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={i.idLabel}>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={i.secretLabel} hint={i.hasSavedSecret ? "Saved. Leave blank to keep it." : i.secretOptional ? "Optional" : undefined}>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={i.hasSavedSecret ? "••••••••••••" : ""} autoComplete="new-password" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={busy === "save"} disabled={!clientId.trim() || !!busy}>
              Save
            </Button>
            {i.source === "app" && (
              <Button type="button" variant="ghost" onClick={() => void remove()} loading={busy === "remove"} disabled={!!busy}>
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}

/** The developer apps (YouTube, Facebook, Instagram) every customer connects their accounts through. */
export function IntegrationsPage() {
  const { data, error, loading, updatedAt, refresh } = useLive<IntegrationsData>("/integrations", 0);
  return (
    <>
      <PageHeader title="Integrations" updatedAt={updatedAt} loading={loading} onRefresh={() => void refresh()} />
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {data.integrations.map((i) => (
            <IntegrationCard key={`${i.id}:${i.savedClientId}:${i.hasSavedSecret}`} i={i} onChange={() => void refresh(true)} />
          ))}
        </div>
      )}
    </>
  );
}
