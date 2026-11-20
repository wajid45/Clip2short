import { useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Stat, Table } from "../components/ui";
import { api, fullDate, num, useLive, when } from "../lib/api";

interface Detail {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    plan: string;
    subscriptionStatus: string;
    activePlan: boolean;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
    trialStartedAt: string | null;
    suspendedAt: string | null;
    twoFactor: boolean;
    suspendedReason: string | null;
    admin: boolean;
  };
  credits: { total: number; bySource: Record<string, { remaining: number; expiresAt: string | null }> };
  counts: { videos: number; clips: number; creditsSpent: number };
  posts: Record<string, number>;
  grants: { id: string; source: string; amount: number; remaining: number; expiresAt: string | null; createdAt: string }[];
  transactions: { id: string; delta: number; kind: string; description: string; createdAt: string; refunded: boolean }[];
  videos: { id: string; title: string; platform: string; durationSec: number | null; analysisStatus: string; captionStatus: string; createdAt: string; clips: number }[];
  accounts: { platform: string; displayName: string; username: string | null; status: string }[];
  history: { id: string; action: string; adminEmail: string; detail: string | null; createdAt: string }[];
}

const ACTIONS: Record<string, string> = {
  credits_granted: "Credits granted",
  user_suspended: "Suspended",
  user_unsuspended: "Suspension lifted",
  user_signed_out: "Signed out everywhere",
};

const PLAN_NAMES: Record<string, string> = { creator: "Creator", pro: "Pro", studio: "Studio" };

const dur = (s: number | null) => (s ? `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ""}${Math.round((s % 3600) / 60)} min` : "?");

function statusTone(s: string): "success" | "warn" | "danger" | "neutral" {
  return s === "done" || s === "ready" ? "success" : s === "running" || s === "pending" ? "warn" : s === "failed" ? "danger" : "neutral";
}

export function UserPage() {
  const { id = "" } = useParams();
  const live = useLive<Detail>(`/users/${id}`, 0);
  const [dialog, setDialog] = useState<null | "grant" | "suspend" | "signout" | "twofactor">(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (live.error && !live.data) return <Alert kind="error">{live.error}</Alert>;
  const d = live.data;
  if (!d) return <Spinner />;
  const u = d.user;
  const done = (msg: string) => {
    setDialog(null);
    setNotice(msg);
    void live.refresh();
  };

  return (
    <>
      <Link to="/users" className="mb-3 inline-flex text-[13px] text-muted hover:text-text">
        ← All users
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {u.name || u.email}
            {u.admin && <Badge tone="brand">Admin</Badge>}
            {u.suspendedAt && <Badge tone="danger">Suspended</Badge>}
            {u.twoFactor && <Badge tone="success">2FA on</Badge>}
          </span>
        }
        description={`${u.email} · joined ${fullDate(u.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setDialog("grant")}>
              Grant credits
            </Button>
            <Button onClick={() => setDialog("signout")}>Sign out everywhere</Button>
            {u.twoFactor && <Button onClick={() => setDialog("twofactor")}>Turn off 2FA</Button>}
            {u.suspendedAt ? (
              <Button
                onClick={async () => {
                  await api(`/users/${u.id}/unsuspend`, { body: {} });
                  done("Suspension lifted. They can sign in again.");
                }}
              >
                Lift suspension
              </Button>
            ) : (
              !u.admin && (
                <Button variant="danger" onClick={() => setDialog("suspend")}>
                  Suspend
                </Button>
              )
            )}
          </div>
        }
      />
      {notice && <Alert kind="success">{notice}</Alert>}
      {u.suspendedAt && (
        <Alert kind="error">
          Suspended {when(u.suspendedAt)}
          {u.suspendedReason ? `: ${u.suspendedReason}` : ""}. They can't sign in until the suspension is lifted.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Plan"
          value={u.activePlan ? (PLAN_NAMES[u.plan] ?? u.plan) : "Free"}
          tone={u.activePlan ? "brand" : undefined}
          sub={u.activePlan ? `${u.cancelAtPeriodEnd ? "Ends" : "Renews"} ${u.currentPeriodEnd ? fullDate(u.currentPeriodEnd) : ""}` : `Status: ${u.subscriptionStatus}`}
        />
        <Stat label="Credits available" value={num(d.credits.total)} sub={Object.entries(d.credits.bySource).map(([s, b]) => `${s} ${num(b.remaining)}`).join(" · ") || "none"} />
        <Stat label="Credits spent" value={num(d.counts.creditsSpent)} sub="all time, minutes of video analysed" />
        <Stat label="Videos · clips" value={`${num(d.counts.videos)} · ${num(d.counts.clips)}`} sub={`${num(d.posts.published ?? 0)} posts published · ${num(d.posts.failed ?? 0)} failed`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Latest videos" pad={false}>
          {d.videos.length === 0 ? (
            <Empty title="No videos yet" />
          ) : (
            <Table head={["Video", "Length", "Captions", "Analysis", "Clips", "Added"]} minWidth={620}>
              {d.videos.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0">
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-text" title={v.title}>
                    {v.title}
                    <span className="ml-2 text-xs text-faint">{v.platform}</span>
                  </td>
                  <td className="tc px-4 py-2.5 text-muted">{dur(v.durationSec)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(v.captionStatus)}>{v.captionStatus}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(v.analysisStatus)}>{v.analysisStatus}</Badge>
                  </td>
                  <td className="tc px-4 py-2.5 text-muted">{v.clips}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{when(v.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Account">
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-[13px]">
              <dt className="text-faint">User id</dt>
              <dd className="tc truncate text-muted">{u.id}</dd>
              <dt className="text-faint">Stripe customer</dt>
              <dd className="tc truncate text-muted">{u.stripeCustomerId ?? "none"}</dd>
              <dt className="text-faint">Trial started</dt>
              <dd className="text-muted">{u.trialStartedAt ? fullDate(u.trialStartedAt) : "never"}</dd>
              <dt className="text-faint">Social accounts</dt>
              <dd className="text-muted">
                {d.accounts.length === 0
                  ? "none connected"
                  : d.accounts.map((a) => (
                      <span key={`${a.platform}${a.displayName}`} className="mr-2 inline-flex items-center gap-1">
                        {a.platform} · {a.displayName}
                        {a.status !== "active" && <Badge tone="warn">{a.status}</Badge>}
                      </span>
                    ))}
              </dd>
            </dl>
          </Card>
          <Card title="Admin history" description="What admins did to this account." pad={false}>
            {d.history.length === 0 ? (
              <Empty title="Nothing yet" />
            ) : (
              <ul className="divide-y divide-line">
                {d.history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-[13px]">
                    <p className="text-text">
                      {ACTIONS[h.action] ?? h.action}
                      {h.detail && <span className="text-muted"> · {h.detail}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {h.adminEmail} · {fullDate(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4" title="Credit history" description="Every credit added, spent or refunded, newest first." pad={false}>
        {d.transactions.length === 0 ? (
          <Empty title="No credit movements" />
        ) : (
          <Table head={["When", "What", "Kind", "Credits"]} minWidth={560}>
            {d.transactions.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fullDate(t.createdAt)}</td>
                <td className="px-4 py-2.5 text-text">
                  {t.description}
                  {t.refunded && <Badge className="ml-2">refunded</Badge>}
                </td>
                <td className="px-4 py-2.5 text-muted">{t.kind}</td>
                <td className={`tc px-4 py-2.5 text-right ${t.delta > 0 ? "text-ready" : "text-text"}`}>
                  {t.delta > 0 ? "+" : ""}
                  {num(t.delta)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <GrantDialog open={dialog === "grant"} userId={u.id} onClose={() => setDialog(null)} onDone={(n) => done(`${num(n)} credits added. They show up in the customer's Billing page right away.`)} />
      <SuspendDialog open={dialog === "suspend"} userId={u.id} email={u.email} onClose={() => setDialog(null)} onDone={() => done("Suspended and signed out of every device.")} />
      <ConfirmDialog
        open={dialog === "signout"}
        title="Sign out everywhere?"
        body={`${u.email} is signed out of every browser and device. Their data is untouched; they can sign in again.`}
        action="Sign out everywhere"
        onClose={() => setDialog(null)}
        run={() => api(`/users/${u.id}/signout`, { body: {} })}
        onDone={() => done("Signed out of every device.")}
      />
      <ConfirmDialog
        open={dialog === "twofactor"}
        title="Turn off two-factor sign-in?"
        body={`Only for someone who lost both their phone and their backup codes. Confirm it's really ${u.email} first (reply from that inbox). They're signed out everywhere and get an email saying 2FA was turned off.`}
        action="Turn off 2FA"
        onClose={() => setDialog(null)}
        run={() => api(`/users/${u.id}/two-factor-off`, { body: {} })}
        onDone={() => done("Two-factor sign-in turned off. They can sign in with their password and turn it on again in Settings.")}
      />
    </>
  );
}

function GrantDialog({ open, userId, onClose, onDone }: { open: boolean; userId: string; onClose: () => void; onDone: (n: number) => void }) {
  const [amount, setAmount] = useState("60");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Grant credits">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/users/${userId}/credits`, { body: { amount: Number(amount), note, expiresInDays: days ? Number(days) : null } });
            onDone(Number(amount));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Credits" hint="1 credit is 1 minute of video.">
          <Input type="number" min={1} max={100000} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note the customer sees" hint="Shown in their credit history. Leave empty for “Added by the Shortlark team”.">
          <Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sorry about the outage" />
        </Field>
        <Field label="Expires after (days)" hint="Leave empty to never expire.">
          <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Grant {amount ? num(Number(amount)) : ""} credits
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SuspendDialog({ open, userId, email, onClose, onDone }: { open: boolean; userId: string; email: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Suspend this account?">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/users/${userId}/suspend`, { body: { reason } });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Alert kind="error">{error}</Alert>}
        <p className="text-sm text-muted">{email} is signed out everywhere and can&apos;t sign in until you lift it. Their videos, clips and subscription are not touched; cancel a subscription in Stripe if needed.</p>
        <Field label="Reason (for the admin history)">
          <Input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Chargeback, abuse report…" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" loading={busy}>
            Suspend
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ open, title, body, action, onClose, run, onDone }: { open: boolean; title: string; body: string; action: string; onClose: () => void; run: () => Promise<unknown>; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await run();
              onDone();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {action}
        </Button>
      </div>
    </Modal>
  );
}
