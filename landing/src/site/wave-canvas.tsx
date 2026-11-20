import clsx from "clsx";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../motion/frame";

/**
 * Lazy WebGL canvas: three.js loads only in the browser, after the page has painted.
 * "hero" is the sunset horizon; "dark" is the point field on the features band.
 */
export function WaveCanvas({ variant, className }: { variant: "hero" | "dark"; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    const reducedMotion = prefersReducedMotion();
    // Data saver, or a low-powered device: skip WebGL; the hero shows a static sunset glow instead.
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) {
      document.documentElement.setAttribute("data-lite", "");
      return;
    }
    const load =
      variant === "hero"
        ? import("../three/aurora-scene").then(({ mountAurora }) => () => mountAurora(canvas, { reducedMotion }))
        : import("../three/wave-scene").then(({ mountWave }) => () => mountWave(canvas, { variant, reducedMotion }));
    load
      .then((mount) => {
        if (cancelled) return;
        try {
          dispose = mount();
          canvas.classList.add("is-ready");
        } catch {
          // No WebGL (old device, disabled GPU): the section still reads fine without it.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [variant]);

  return <canvas ref={ref} className={clsx("wave-canvas pointer-events-none absolute inset-0 size-full", className)} aria-hidden="true" />;
}
