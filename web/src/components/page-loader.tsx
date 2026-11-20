import clsx from "clsx";
import { LogoMark } from "@shortlark/shared/components/logo";

/** Centered loading state shown while a page streams in: the mark inside a spinning progress ring. */
export function PageLoader({ label = "Loading", offsetSidebar = false }: { label?: string; offsetSidebar?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx("fixed inset-0 z-20 flex items-center justify-center", offsetSidebar && "lg:pl-[var(--nav-w,240px)]")}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-16">
          <svg className="absolute inset-0 size-16 animate-spin [animation-duration:900ms]" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="44 132"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <LogoMark size={26} className="animate-pulse [animation-duration:1.6s]" />
          </div>
        </div>
        <span className="text-xs tracking-wide text-faint">{label}…</span>
      </div>
    </div>
  );
}
