import clsx from "clsx";
import { useEffect, useRef } from "react";

/**
 * The landing hero's sunset aurora (three/aurora-scene.ts) as a backdrop for other pages.
 * three.js loads only after the page has painted; data saver and low-powered devices skip it and
 * keep the soft static glow underneath, and reduced motion draws one still frame.
 */
export function AuroraBackdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("../three/aurora-scene")
      .then(({ mountAurora }) => {
        if (cancelled) return;
        try {
          dispose = mountAurora(canvas, { reducedMotion });
          canvas.style.opacity = "1";
        } catch {
          // No WebGL: the static glow stays.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <div className={clsx("pointer-events-none overflow-hidden", className)} aria-hidden="true">
      {/* Static glow in the same colours, shown before (or instead of) the animation */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 45% at 0% 100%, rgba(54,94,207,0.35), transparent 70%), radial-gradient(55% 45% at 50% 105%, rgba(226,66,192,0.28), transparent 70%), radial-gradient(60% 45% at 100% 100%, rgba(255,167,59,0.35), transparent 70%)",
        }}
      />
      <canvas ref={ref} className="absolute inset-0 size-full opacity-0 transition-opacity duration-1000" />
      {/* Keep the middle calm so the form reads clearly, like the hero keeps its headline clear */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 42% at 50% 46%, color-mix(in srgb, var(--color-bg) 78%, transparent) 0%, transparent 78%), linear-gradient(180deg, var(--color-bg) 0%, transparent 24%)",
        }}
      />
      <div className="aurora-floor absolute inset-0" />
    </div>
  );
}
