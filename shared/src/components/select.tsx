import clsx from "clsx";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * The dropdown used across the web app, the admin portal and the landing site, in place of the
 * browser's native <select> (whose open list can't be styled). It keeps the native behaviour people
 * rely on: arrow keys, Home/End, type to jump, Enter/Space to pick, Escape to close, and a listbox
 * that screen readers announce. With `name`, the value is also submitted with a surrounding <form>.
 */

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  name,
  disabled,
  size = "md",
  className,
  menuClassName,
}: {
  value: V;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  ariaLabel?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Open upward when there isn't room below, and keep the highlighted option in view.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const needed = Math.min(288, options.length * 36 + 12);
    setUp(window.innerHeight - r.bottom < needed && r.top > window.innerHeight - r.bottom);
  }, [open, options.length]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openMenu() {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function pick(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    button.current?.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (disabled) return;
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(last, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key.length === 1) {
      // Type to jump to an option, like a native select.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  }

  const heights = { sm: "h-8 text-[13px] pl-3 pr-8", md: "h-10 text-sm pl-3.5 pr-9", lg: "h-12 text-[15px] pl-4 pr-10" };
  return (
    <div ref={root} className={clsx("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={clsx(
          "relative flex w-full items-center rounded-lg border border-line-strong bg-surface text-left text-text transition-[border-color,box-shadow] outline-none hover:border-faint focus-visible:border-signal focus-visible:ring-3 focus-visible:ring-signal/20 disabled:cursor-not-allowed disabled:opacity-55 dark:border-[#4a4b55] dark:bg-surface-2",
          open && "border-signal ring-3 ring-signal/20",
          heights[size],
        )}
      >
        <span className="truncate">{current?.label}</span>
        <svg
          viewBox="0 0 20 20"
          className={clsx("pointer-events-none absolute right-3 size-4 text-muted transition-transform duration-200", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5.5 8l4.5 4.5L14.5 8" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={clsx(
            "absolute z-50 max-h-72 min-w-full overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)] dark:bg-surface-2",
            up ? "bottom-full mb-1.5" : "top-full mt-1.5",
            menuClassName,
          )}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(i)}
                className={clsx(
                  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg pr-3 pl-2.5 text-sm whitespace-nowrap transition-colors",
                  i === active ? "bg-surface-2 text-text dark:bg-surface-3" : "text-muted",
                  selected && "font-medium text-text",
                )}
              >
                <svg viewBox="0 0 20 20" className={clsx("size-4 shrink-0 text-signal", !selected && "invisible")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                </svg>
                {o.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
