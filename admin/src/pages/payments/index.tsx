import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Select } from "@shortlark/shared/components/select";
import { LineChart, dayLong, dayShort } from "../../components/charts";
import { useToast } from "../../components/toast";
import { Alert, Badge, Button, Card, Empty, Input, PageHeader, Pager, Segmented, Spinner, Stat, Table, cx } from "../../components/ui";
import { api, useLive } from "../../lib/api";

type Status = "paid" | "failed" | "refunded" | "partially_refunded";

interface Payment {
  id: string;
  userId: string | null;
  email: string | null;
  kind: "plan" | "pack";
  status: Status;
  amountCents: number | null;
  refundedCents: number;
  currency: string;
  description: string;
  ref: string;
  tags: string[];
  createdAt: string;
}

interface Data {
  summary: { netCents: number; grossCents: number; refundedCents: number; paid: number; failed: number; refunds: number; plans: number; packs: number };
  revenueByDay: { key: string; cents: number }[];
  payments: Payment[];
  total: number;
  perPage: number;
  allTags: string[];
}

const STATUSES = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
] as const;

const KINDS = [
  { value: "all", label: "All types" },
  { value: "plan", label: "Plans" },
  { value: "pack", label: "Credit packs" },
] as const;

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "partially_refunded", label: "Partly refunded" },
] as const;

const STATUS_BADGE: Record<Status, { tone: "success" | "danger" | "warn"; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "warn", label: "Refunded" },
  partially_refunded: { tone: "warn", label: "Partly refunded" },
};

/** Money as the customer paid it: $24.00, €39.00. */
function money(cents: number | null, currency = "usd") {
  if (cents === null) return "Not recorded";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Every payment through Stripe: new plans, renewals, credit packs, failed charges and refunds. */
export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "all") as (typeof STATUSES)[number]["value"];
  const kind = (params.get("kind") ?? "all") as (typeof KINDS)[number]["value"];
  const page = Number(params.get("page") ?? 1) || 1;
  const live = useLive<Data>(`/payments?status=${status}&kind=${kind}&page=${page}`, 60_000);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();

  async function setStatus(p: Payment, next: Status) {
    try {
      await api(`/payments/${p.id}`, { method: "PATCH", body: { status: next } });
      toast(`Marked ${STATUS_BADGE[next].label.toLowerCase()}.`);
      void live.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "all") p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  const d = live.data;
  return (
    <>
      <PageHeader title="Payments" updatedAt={live.updatedAt} loading={live.loading} onRefresh={() => void live.refresh()} />
      {live.error && <Alert kind="error">{live.error}</Alert>}
      {!d ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Net revenue (30 days)"
              value={money(d.summary.netCents)}
              tone="success"
              hint="What customers paid in the last 30 days, minus refunds."
              sub={`${money(d.summary.grossCents)} paid · ${money(d.summary.refundedCents)} refunded`}
              trend={d.revenueByDay.map((p) => p.cents)}
            />
            <Stat label="Payments (30 days)" value={d.summary.paid} hint="Successful charges in the last 30 days." sub={`${d.summary.plans} plans · ${d.summary.packs} packs`} />
            <Stat
              label="Failed (30 days)"
              value={d.summary.failed}
              tone={d.summary.failed ? "danger" : undefined}
              hint="Charges the bank declined. Stripe retries plan renewals automatically."
              sub={d.summary.failed ? <button className="text-signal hover:underline" onClick={() => update({ status: "failed", page: null })}>See which</button> : "None"}
            />
            <Stat label="Refunds (30 days)" value={d.summary.refunds} tone={d.summary.refunds ? "warn" : undefined} hint="Payments refunded in full or in part." sub={money(d.summary.refundedCents)} />
          </div>

          <Card className="mb-6" title="Revenue per day">
            <LineChart data={d.revenueByDay.map((p) => ({ label: dayShort(p.key), title: dayLong(p.key), value: p.cents / 100 }))} xLabel="Day" yLabel="Revenue (USD)" color="var(--color-ready)" />
          </Card>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-signal/40 bg-signal-soft py-1 pr-1 pl-3 text-[13px] text-text">
                {selected.size} selected
                <TagsButton
                  ids={[...selected]}
                  allTags={d.allTags ?? []}
                  current={d.payments.filter((p) => selected.has(p.id))}
                  onDone={(msg) => {
                    toast(msg);
                    void live.refresh();
                  }}
                />
                <button type="button" onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1 text-muted hover:text-text">
                  Clear
                </button>
              </div>
            )}
            <Segmented label="Filter payments by status" options={[...STATUSES]} value={status} onChange={(v) => update({ status: v, page: null })} />
            <Select ariaLabel="Payment type" size="sm" className="ml-auto w-40" menuClassName="right-0 left-auto" value={kind} onChange={(v) => update({ kind: v, page: null })} options={KINDS} />
          </div>

          <Card pad={false}>
            {d.payments.length === 0 ? (
              <Empty title="No payments here" body="Nothing matches these filters yet." />
            ) : (
              <>
                <Table
                  head={[
                    <input
                      key="all"
                      type="checkbox"
                      aria-label="Select all on this page"
                      className="size-4 cursor-pointer accent-[var(--color-signal)]"
                      checked={d.payments.every((p) => selected.has(p.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(d.payments.map((p) => p.id)) : new Set())}
                    />,
                    "Date",
                    "Customer",
                    "What",
                    "Amount",
                    "Status",
                    "Tags",
                  ]}
                  minWidth={920}
                >
                  {d.payments.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <tr key={p.id} className={cx("border-b border-line last:border-b-0", on && "bg-signal-soft/40")}>
                        <td className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select payment from ${p.email ?? "deleted account"}`}
                            className="size-4 cursor-pointer accent-[var(--color-signal)]"
                            checked={on}
                            onChange={() => {
                              const next = new Set(selected);
                              if (on) next.delete(p.id);
                              else next.add(p.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="block text-text">{dateOf(p.createdAt)}</span>
                          <span className="block text-[12px] text-faint">{timeOf(p.createdAt)}</span>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3">
                          {p.userId ? (
                            <Link to={`/users/${p.userId}`} className="text-text hover:text-signal">
                              {p.email ?? "Unknown"}
                            </Link>
                          ) : (
                            <span className="text-muted">{p.email ?? "Deleted account"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text">{p.description}</td>
                        <td className="num px-4 py-3 whitespace-nowrap text-text">
                          {money(p.amountCents, p.currency)}
                          {p.refundedCents > 0 && <span className="ml-1.5 text-[12px] text-faint">({money(p.refundedCents, p.currency)} back)</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusMenu status={p.status} onChange={(next) => void setStatus(p, next)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[200px] flex-wrap gap-1">
                            {p.tags.length ? p.tags.map((t) => <Badge key={t} tone="brand">{t}</Badge>) : <span className="text-faint">None</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <Pager page={page} perPage={d.perPage} total={d.total} onChange={(p) => update({ page: p === 1 ? null : String(p) })} />
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}

/** A small popover that closes on an outside click or Escape. */
function usePopover() {
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
  return { open, setOpen, ref };
}

const panel = "absolute z-40 mt-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)] dark:bg-surface-2";

/** The status badge; clicking it opens the statuses to pick from. */
function StatusMenu({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const { open, setOpen, ref } = usePopover();
  const badge = STATUS_BADGE[status];
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Change status" className="inline-flex items-center gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-signal">
        <Badge tone={badge.tone}>
          {badge.label}
          <svg viewBox="0 0 20 20" className="ml-1 size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5.5 8l4.5 4.5L14.5 8" />
          </svg>
        </Badge>
      </button>
      {open && (
        <div role="menu" className={cx(panel, "left-0 w-44")}>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === status}
              onClick={() => {
                setOpen(false);
                if (o.value !== status) onChange(o.value);
              }}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-text hover:bg-surface-2 dark:hover:bg-surface-3"
            >
              <span className={cx("size-1.5 rounded-full", o.value === "paid" ? "bg-ready" : o.value === "failed" ? "bg-danger" : "bg-draft")} aria-hidden="true" />
              <span className="flex-1">{o.label}</span>
              {o.value === status && <span className="text-signal">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tags for the selected payments: tick existing tags on or off, or type a new one. */
function TagsButton({ ids, allTags, current, onDone }: { ids: string[]; allTags: string[]; current: Payment[]; onDone: (msg: string) => void }) {
  const { open, setOpen, ref } = usePopover();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const has = (t: string) => current.length > 0 && current.every((p) => p.tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  async function apply(add: string[], remove: string[]) {
    setBusy(true);
    try {
      await api("/payments/tags", { body: { ids, add, remove } });
      onDone(add.length ? `Tag "${add[0]}" added to ${ids.length} ${ids.length === 1 ? "payment" : "payments"}.` : `Tag "${remove[0]}" removed.`);
    } catch (e) {
      onDone((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="primary" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} loading={busy}>
        Tags
      </Button>
      {open && (
        <div role="dialog" aria-label="Tags" className={cx(panel, "left-0 w-64")}>
          {allTags.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              {allTags.map((t) => {
                const on = has(t);
                return (
                  <label key={t} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-text hover:bg-surface-2 dark:hover:bg-surface-3">
                    <input type="checkbox" className="size-4 accent-[var(--color-signal)]" checked={on} onChange={() => void apply(on ? [] : [t], on ? [t] : [])} />
                    {t}
                  </label>
                );
              })}
              <div className="my-1.5 h-px bg-line" />
            </div>
          )}
          <form
            className="flex gap-1.5 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              const t = draft.trim();
              if (!t) return;
              setDraft("");
              void apply([t], []);
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New tag" maxLength={32} className="h-8" autoFocus />
            <Button size="sm" type="submit" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
