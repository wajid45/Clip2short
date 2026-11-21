import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconInfo, IconX } from "@shortlark/shared/components/icons";
import { cx } from "./ui";

/** Short confirmations ("Suspended", "Credits added") that slide in, stay ~3.5 s, then leave. */

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});
const VISIBLE_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((message: string, kind: Kind = "success") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, kind, message }]); // at most three on screen
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true));
    const leave = setTimeout(() => setShown(false), VISIBLE_MS);
    const gone = setTimeout(onDone, VISIBLE_MS + 250);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, [onDone]);
  const Icon = toast.kind === "success" ? IconCheck : toast.kind === "error" ? IconX : IconInfo;
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={cx(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <span
        className={cx(
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
          toast.kind === "success" && "bg-ready/15 text-ready",
          toast.kind === "error" && "bg-danger/15 text-danger",
          toast.kind === "info" && "bg-surface-3 text-muted",
        )}
      >
        <Icon size={12} strokeWidth={2.2} />
      </span>
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button type="button" onClick={onDone} aria-label="Dismiss" className="-mr-1 rounded-md p-0.5 text-faint hover:bg-surface-2 hover:text-text">
        <IconX size={14} />
      </button>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
