"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

/** The theme actually on screen: the saved choice, or the system preference when nothing is saved. */
function effective(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * One button that flips between light and dark. First visit follows the system;
 * after a click the choice is saved in a cookie so the server renders it without a flash.
 */
export function ThemeToggle({ initial, className }: { initial: ThemeChoice; className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(initial === "system" ? null : initial);

  useEffect(() => {
    setTheme(effective());
    if (initial !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (!document.documentElement.hasAttribute("data-theme")) setTheme(effective());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [initial]);

  function toggle() {
    const next = effective() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `sl_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setTheme(next);
  }

  const isDark = theme !== "light";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={clsx(
        "relative inline-flex size-9 items-center justify-center overflow-hidden rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-text",
        className,
      )}
    >
      {/* sun */}
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
        className={clsx("absolute transition-all duration-300", isDark ? "translate-y-0 rotate-0 opacity-100" : "-translate-y-5 rotate-90 opacity-0")}
      >
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
      </svg>
      {/* moon */}
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={clsx("absolute transition-all duration-300", isDark ? "translate-y-5 -rotate-90 opacity-0" : "translate-y-0 rotate-0 opacity-100")}
      >
        <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" />
      </svg>
    </button>
  );
}
