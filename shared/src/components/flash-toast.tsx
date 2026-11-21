import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconInfo, IconX } from "./icons";

const VISIBLE_MS = 3500;
const ERROR_MS = 6000; // errors linger a little longer so they can be read

/** One stack in the bottom-right corner, shared by every toast on the page. */
function stack(): HTMLElement {
  let el = document.getElementById("sl-toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "sl-toasts";
    el.setAttribute("aria-live", "polite");
    el.className =
      "pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end";
    document.body.appendChild(el);
  }
  return el;
}

type Tone = "success" | "error" | "info";

/**
 * A message shown as a toast: it slides in, waits a few seconds, then leaves. Render it where an
 * inline notice would go; it shows again whenever its text changes. `tone` sets the icon and colour
 * (success green, error red, info neutral); errors stay on screen a little longer.
 */
export function FlashToast({ children, tone = "success" }: { children: ReactNode; tone?: Tone }) {
  // Re-show when the message text changes; rich content shows once per mount.
  const text = typeof children === "string" || typeof children === "number" ? String(children) : "node";
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const dwell = tone === "error" ? ERROR_MS : VISIBLE_MS;

  useEffect(() => setTarget(stack()), []);
  useEffect(() => {
    setGone(false);
    const enter = requestAnimationFrame(() => setShown(true));
    const leave = setTimeout(() => setShown(false), dwell);
    const end = setTimeout(() => setGone(true), dwell + 250);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leave);
      clearTimeout(end);
    };
  }, [text, dwell]);

  if (!target || gone) return null;
  const chip =
    tone === "error" ? "bg-danger/15 text-danger" : tone === "info" ? "bg-surface-3 text-muted" : "bg-ready/15 text-ready";
  const Icon = tone === "success" ? IconCheck : tone === "error" ? IconX : IconInfo;
  return createPortal(
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200 ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
    >
      <span className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full ${chip}`}>
        <Icon size={12} strokeWidth={2.2} />
      </span>
      <div className="flex-1 leading-snug">{children}</div>
      <button
        type="button"
        onClick={() => {
          setShown(false);
          setTimeout(() => setGone(true), 200);
        }}
        aria-label="Dismiss"
        className="-mr-1 rounded-md p-0.5 text-faint hover:bg-surface-2 hover:text-text"
      >
        <IconX size={14} />
      </button>
    </div>,
    target,
  );
}
