import { useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Empty, PageHeader, Segmented, Spinner } from "../../components/ui";
import { api, fullDate, useLive } from "../../lib/api";

interface Message {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  handled: boolean;
  createdAt: string;
  userId: string | null;
}

const TOPICS: Record<string, string> = { general: "General", sales: "Sales", support: "Support", billing: "Billing", partnership: "Partnership", legal: "Legal" };

/** Messages from the landing site's contact form. */
export function MessagesPage() {
  const [status, setStatus] = useState<"open" | "handled" | "all">("open");
  const live = useLive<{ open: number; messages: Message[] }>(`/messages?status=${status}`, 60_000);
  const [busy, setBusy] = useState<string | null>(null);

  async function mark(id: string, handled: boolean) {
    setBusy(id);
    try {
      await api(`/messages/${id}`, { method: "PATCH", body: { handled } });
      window.dispatchEvent(new Event("sl-admin:badges"));
      await live.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Messages"
        updatedAt={live.updatedAt}
        loading={live.loading}
        onRefresh={() => void live.refresh()}
      />
      {live.error && <Alert kind="error">{live.error}</Alert>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Filter messages"
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: `Open${live.data ? ` · ${live.data.open}` : ""}` },
            { value: "handled", label: "Handled" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {!live.data ? (
        <Spinner />
      ) : live.data.messages.length === 0 ? (
        <Card>
          <Empty title={status === "open" ? "Inbox zero" : "No messages"} body={status === "open" ? "Nothing waiting for a reply." : undefined} />
        </Card>
      ) : (
        <div className="space-y-3">
          {live.data.messages.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                    {m.name}
                    <span className="font-normal text-muted">{m.email}</span>
                    <Badge tone="brand">{TOPICS[m.topic] ?? m.topic}</Badge>
                    {m.handled && <Badge tone="success">Handled</Badge>}
                    {m.userId && (
                      <Link to={`/users/${m.userId}`} className="text-xs text-signal hover:underline">
                        Has an account
                      </Link>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">{fullDate(m.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to Clip2Short")}`} className="inline-flex h-8 items-center rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-text hover:border-line-strong">
                    Reply by email
                  </a>
                  <Button size="sm" variant={m.handled ? "ghost" : "primary"} loading={busy === m.id} onClick={() => void mark(m.id, !m.handled)}>
                    {m.handled ? "Reopen" : "Mark handled"}
                  </Button>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-text">{m.message}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
