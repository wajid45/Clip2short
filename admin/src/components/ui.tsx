import clsx from "clsx";
import { FlashToast } from "@shortlark/shared/components/flash-toast";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { PasswordToggle } from "@shortlark/shared/components/password-toggle";
import { IconRefresh } from "@shortlark/shared/components/icons";
import { Sparkline } from "./charts";

export const cx = clsx;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-normal whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-signal text-on-signal hover:bg-signal-strong",
        variant === "secondary" && "border border-line bg-surface-2 text-text hover:border-line-strong hover:bg-surface-3",
        variant === "ghost" && "text-text hover:bg-surface-2",
        variant === "danger" && "border border-danger/40 text-danger hover:bg-danger/10",
        className,
      )}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-faint transition-[border-color,box-shadow] hover:border-faint focus:border-signal focus:ring-3 focus:ring-signal/20 focus:outline-none dark:border-[#4a4b55] dark:bg-surface-2 dark:placeholder:text-muted/75 dark:hover:border-[#5e5f6b]",
        props.className,
      )}
    />
  );
}

/** Password field with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cx("pr-11", props.className)} />
      <PasswordToggle shown={shown} onToggle={() => setShown((v) => !v)} />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-normal text-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Card({ title, description, action, children, className, pad = true }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-medium text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      <span
        tabIndex={0}
        aria-label="What this means"
        className="flex size-4 cursor-help items-center justify-center rounded-full border border-line-strong text-[10px] text-faint outline-none hover:text-text focus-visible:text-text"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface-3 p-2.5 text-xs leading-relaxed font-normal text-text opacity-0 shadow-xl transition group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

const TONES = {
  brand: "text-signal",
  success: "text-ready",
  warn: "text-draft",
  danger: "text-danger",
};

export function Stat({
  label,
  value,
  sub,
  hint,
  tone,
  trend,
  trendTone = "good",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof TONES;
  trend?: number[];
  /** Green when more is good news, red when more is bad (failures, suspensions), orange for costs. */
  trendTone?: "good" | "bad" | "cost";
}) {
  return (
    <div className="relative rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={cx("num text-[30px] leading-none font-normal tracking-[-0.01em]", tone ? TONES[tone] : "text-text")}>{value}</p>
        {trend && trend.length > 1 && <Sparkline points={trend} color={trendTone === "good" ? "var(--color-ready)" : trendTone === "bad" ? "var(--color-danger)" : "var(--color-signal)"} />}
      </div>
      {sub && <p className="mt-2 truncate text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  updatedAt,
  loading,
  onRefresh,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  updatedAt?: number | null;
  loading?: boolean;
  onRefresh?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] leading-tight tracking-[-0.02em] text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {updatedAt && <span className="text-xs text-faint">Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-wait"
          >
            <IconRefresh size={15} className={loading ? "animate-spin" : undefined} />
          </button>
        )}
        {action}
      </div>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <h2 className="mt-7 mb-3 flex items-center gap-2 text-[12px] font-medium tracking-wide text-faint uppercase">
      {children}
      {hint && <InfoTip text={hint} />}
    </h2>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "brand" | "success" | "warn" | "danger"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-3 text-muted",
        tone === "brand" && "bg-signal-soft text-signal",
        tone === "success" && "bg-ready/15 text-ready",
        tone === "warn" && "bg-draft/15 text-draft",
        tone === "danger" && "bg-danger/15 text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
  if (kind === "success" || kind === "error") return <FlashToast tone={kind}>{children}</FlashToast>; // confirmations and errors are toasts
  return <div role="status" className={cx("mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted")}>{children}</div>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-signal border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-normal text-text">{title}</p>
      {body && <p className="mt-1 text-[13px] text-muted">{body}</p>}
    </div>
  );
}

export function Table({ head, children, minWidth = 720 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line text-[11.5px] tracking-wide text-faint uppercase">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ page, perPage, total, onChange }: { page: number; perPage: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
      <span>
        {total === 0 ? "No results" : `${(page - 1) * perPage + 1} to ${Math.min(total, page * perPage)} of ${total.toLocaleString("en-US")}`}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("h-8 rounded-md px-3 text-[13px] transition-colors", value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Dialog over a dimmed page. Escape and the backdrop close it unless `locked`. */
export function Modal({ open, onClose, title, children, locked }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; locked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => window.removeEventListener("keydown", key);
  }, [open, locked, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !locked && onClose()} />
      <div ref={ref} role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <h2 className="text-[17px] font-medium text-text">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
