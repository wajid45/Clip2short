import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Badge, Button, cx, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Stat, Table } from "../../components/ui";
import { api, fullDate, num, useLive, when } from "../../lib/api";
import { useToast } from "../../components/toast";
import { Select } from "@shortlark/shared/components/select";
import { IconArrowLeft } from "@shortlark/shared/components/icons";

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
    adminAuthenticator: boolean;
    isSelf: boolean;
    stripeSubscription: boolean;
    suspendedReason: string | null;
    admin: boolean;
  };
  credits: { total: number; bySource: Record<string, { remaining: number; expiresAt: string | null }> };
  counts: { videos: number; clips: number; creditsSpent: number };
  posts: Record<string, number>;
  grants: { id: string; source: string; amount: number; remaining: number; expiresAt: string | null; createdAt: string }[];
  transactions: { id: string; delta: number; kind: string; description: string; createdAt: string; refunded: boolean }[];
  videos: { id: string; title: string; platform: string; durationSec: number | null; analysisStatus: string; captionStatus: string; createdAt: string; clips: number }[];
  accounts: { platform: string; displayName: string; username: string | null; status: string; createdAt: string; tokenExpiresAt: string | null }[];
  stripe: {
    customerId: string | null;
    subscriptionId: string | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paidCents: number;
    payments: number;
    failed: number;
    lastPaymentAt: string | null;
    customerUrl: string | null;
    subscriptionUrl: string | null;
  };
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
  const [dialog, setDialog] = useState<null | "grant" | "plan" | "suspend" | "signout" | "twofactor" | "authenticator">(null);
  const toast = useToast();

  // A load failure leaves the page empty, so it stays inline (a toast would vanish); action errors below are toasts.
  if (live.error && !live.data) return <Empty title="Couldn't load this user" body={live.error} />;
  const d = live.data;
  if (!d) return <Spinner />;
  const u = d.user;
  const done = (msg: string) => {
    setDialog(null);
    toast(msg);
    void live.refresh();
  };

  return (
    <>
      <Link to="/users" className="group mb-3 inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-text">
        <span className="flex size-6 items-center justify-center rounded-full border border-line transition-colors group-hover:border-line-strong group-hover:bg-surface-2">
          <IconArrowLeft size={13} />
        </span>
        All users
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
        action={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setDialog("grant")}>
              Grant credits
            </Button>
            <Button onClick={() => setDialog("plan")}>Change plan</Button>
            <MoreMenu
              items={[
                { label: "Sign out everywhere", onClick: () => setDialog("signout") },
                ...(u.twoFactor ? [{ label: "Turn off 2FA", onClick: () => setDialog("twofactor") }] : []),
                ...(u.admin && u.adminAuthenticator && !u.isSelf ? [{ label: "Reset authenticator", onClick: () => setDialog("authenticator") }] : []),
                ...(u.suspendedAt
                  ? [
                      {
                        label: "Lift suspension",
                        onClick: async () => {
                          await api(`/users/${u.id}/unsuspend`, { body: {} });
                          done("Suspension lifted. They can sign in again.");
                        },
                      },
                    ]
                  : !u.admin
                    ? [{ label: "Suspend account", danger: true, onClick: () => setDialog("suspend") }]
                    : []),
              ]}
            />
          </div>
        }
      />
      {u.suspendedAt && (
        <p className="-mt-4 mb-6 flex items-center gap-2 text-[13px] text-danger">
          <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
          Suspended {when(u.suspendedAt)}
          {u.suspendedReason ? `: ${u.suspendedReason}` : ""}. They can&apos;t sign in until it&apos;s lifted.
        </p>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="contents">
          <Card title="Account">
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-[13px]">
              <dt className="text-faint">Name</dt>
              <dd className="truncate text-text">{u.name || "Not set"}</dd>
              <dt className="text-faint">Email</dt>
              <dd className="truncate text-text">{u.email}</dd>
              <dt className="text-faint">Joined</dt>
              <dd className="text-muted">{fullDate(u.createdAt)}</dd>
              <dt className="text-faint">Plan</dt>
              <dd className="text-muted">
                {u.activePlan ? `${PLAN_NAMES[u.plan] ?? u.plan}, ${u.subscriptionStatus}` : "Free"}
                {u.activePlan && u.currentPeriodEnd && ` · ${u.cancelAtPeriodEnd ? "ends" : "renews"} ${fullDate(u.currentPeriodEnd)}`}
              </dd>
              <dt className="text-faint">Two-factor</dt>
              <dd className="text-muted">{u.twoFactor ? "On" : "Off"}</dd>
              <dt className="text-faint">User id</dt>
              <dd className="tc truncate text-muted">{u.id}</dd>
              <dt className="text-faint">Trial started</dt>
              <dd className="text-muted">{u.trialStartedAt ? fullDate(u.trialStartedAt) : "never"}</dd>
            </dl>
          </Card>
          {d.stripe && (
          <Card title="Stripe and social accounts">
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-[13px]">
              <dt className="text-faint">Customer</dt>
              <dd className="truncate">
                {d.stripe.customerUrl ? (
                  <a href={d.stripe.customerUrl} target="_blank" rel="noopener" className="tc text-signal hover:underline">
                    {d.stripe.customerId}
                  </a>
                ) : (
                  <span className="text-muted">Not a Stripe customer yet</span>
                )}
              </dd>
              <dt className="text-faint">Subscription</dt>
              <dd className="truncate">
                {d.stripe.subscriptionUrl ? (
                  <a href={d.stripe.subscriptionUrl} target="_blank" rel="noopener" className="tc text-signal hover:underline">
                    {d.stripe.subscriptionId}
                  </a>
                ) : (
                  <span className="text-muted">None</span>
                )}
                {d.stripe.subscriptionId && <span className="ml-2 text-muted">{d.stripe.status}</span>}
              </dd>
              {d.stripe.currentPeriodEnd && (
                <>
                  <dt className="text-faint">{d.stripe.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
                  <dd className="text-muted">{fullDate(d.stripe.currentPeriodEnd)}</dd>
                </>
              )}
              <dt className="text-faint">Paid in total</dt>
              <dd className="num text-text">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(d.stripe.paidCents / 100)}
                <span className="ml-2 font-sans text-muted">
                  {d.stripe.payments} {d.stripe.payments === 1 ? "payment" : "payments"}
                  {d.stripe.failed > 0 && <span className="text-danger"> · {d.stripe.failed} failed</span>}
                </span>
              </dd>
              <dt className="text-faint">Last payment</dt>
              <dd className="text-muted">{d.stripe.lastPaymentAt ? fullDate(d.stripe.lastPaymentAt) : "Never"}</dd>
            </dl>
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[12px] tracking-wide text-faint uppercase">Social accounts</p>
              {d.accounts.length === 0 ? (
                <p className="text-[13px] text-muted">None connected</p>
              ) : (
                <ul className="space-y-2 text-[13px]">
                  {d.accounts.map((a) => (
                    <li key={`${a.platform}${a.displayName}`} className="flex flex-wrap items-center gap-2">
                      <Badge>{a.platform}</Badge>
                      <span className="text-text">{a.displayName}</span>
                      {a.username && <span className="text-muted">@{a.username}</span>}
                      <Badge tone={a.status === "active" ? "success" : "warn"}>{a.status}</Badge>
                      <span className="ml-auto text-faint">connected {fullDate(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          )}
        </div>
      </div>

      <Card className="mt-4" title="Credit history" pad={false}>
        {d.transactions.length === 0 ? (
          <Empty title="No credit movements" />
        ) : (
          <Table head={["Date", "Plan", "Kind", "Credits"]} minWidth={560}>
            {d.transactions.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fullDate(t.createdAt)}</td>
                <td className="px-4 py-2.5 text-text">
                  {t.description}
                  {t.refunded && <Badge className="ml-2">refunded</Badge>}
                </td>
                <td className="px-4 py-2.5 text-muted">{t.kind}</td>
                <td className={`num px-4 py-2.5 ${t.delta > 0 ? "text-ready" : "text-text"}`}>
                  {t.delta > 0 ? "+" : ""}
                  {num(t.delta)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <PlanDialog
        open={dialog === "plan"}
        userId={u.id}
        current={u.activePlan ? u.plan : "none"}
        stripe={u.stripeSubscription}
        onClose={() => setDialog(null)}
        onDone={(detail) => done(`Plan changed: ${detail}.`)}
      />
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
        open={dialog === "authenticator"}
        title="Reset this admin's authenticator?"
        body={`For an admin who lost their phone. Check it's really ${u.email} first. Their portal sessions end; their next sign-in emails them a code and shows a new QR code.`}
        action="Reset authenticator"
        onClose={() => setDialog(null)}
        run={() => api(`/users/${u.id}/reset-authenticator`, { body: {} })}
        onDone={() => done("Authenticator reset. Their next sign-in sets up a new one.")}
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

/** The less common account actions, in one menu so the header keeps three tidy buttons. */
function MoreMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        More
        <svg viewBox="0 0 20 20" className={cx("size-4 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5.5 8l4.5 4.5L14.5 8" />
        </svg>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)] dark:bg-surface-2">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cx(
                "flex h-9 w-full items-center rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-surface-2 dark:hover:bg-surface-3",
                it.danger ? "text-danger" : "text-text",
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PLAN_OPTIONS = [
  { value: "none", label: "Free" },
  { value: "creator", label: "Creator" },
  { value: "pro", label: "Pro" },
  { value: "studio", label: "Studio" },
] as const;

function PlanDialog({ open, userId, current, stripe, onClose, onDone }: { open: boolean; userId: string; current: string; stripe: boolean; onClose: () => void; onDone: (detail: string) => void }) {
  const [plan, setPlan] = useState<string>(current);
  const [grant, setGrant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Change plan">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ detail: string }>(`/users/${userId}/plan`, { body: { plan, grantCredits: grant } });
            onDone(r.detail);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Plan">
          <Select ariaLabel="Plan" value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
        </Field>
        <p className="text-[13px] leading-relaxed text-muted">
          {stripe
            ? plan === "none"
              ? "They pay through Stripe: the subscription cancels at the end of the period they've paid for."
              : "They pay through Stripe: the subscription switches now and Stripe prorates the difference on their next invoice."
            : plan === "none"
              ? "The plan ends now. Credits they already have stay."
              : "Given directly for 30 days, without charging them."}
        </p>
        {!stripe && plan !== "none" && (
          <label className="flex items-center gap-2.5 text-[13px] text-text">
            <input type="checkbox" checked={grant} onChange={(e) => setGrant(e.target.checked)} className="size-4 accent-[var(--color-signal)]" />
            Add this plan&apos;s monthly credits now
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy} disabled={plan === current}>
            Change plan
          </Button>
        </div>
      </form>
    </Modal>
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
        <Field label="Note the customer sees" hint="Shown in their credit history. Leave empty for “Added by the Clip2Short team”.">
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
