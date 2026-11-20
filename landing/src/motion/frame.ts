import { useEffect, useRef } from "react";

/**
 * One shared requestAnimationFrame loop for every scroll-driven effect on the page.
 * Subscribers run only on frames where the scroll position or viewport size changed,
 * so an idle page costs nothing.
 */

type Sub = () => void;
const subs = new Set<Sub>();
let raf = 0;
let lastY = -1;
let dirty = true;

function markDirty() {
  dirty = true;
}

function loop() {
  raf = requestAnimationFrame(loop);
  const y = window.scrollY;
  if (y === lastY && !dirty) return;
  lastY = y;
  dirty = false;
  subs.forEach((f) => f());
}

export function onScrollFrame(f: Sub) {
  subs.add(f);
  dirty = true;
  if (!raf) {
    window.addEventListener("resize", markDirty);
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && raf) {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", markDirty);
      raf = 0;
    }
  };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Progress of an element through the viewport, 0 to 1.
 * "sticky": 0 when its top reaches the top of the viewport, 1 when its bottom reaches the bottom
 *   (use on a tall section that holds a sticky stage).
 * "through": 0 when its top enters from below, 1 when its bottom leaves at the top.
 */
export function useScrollProgress<T extends HTMLElement>(cb: (p: number, el: T) => void, mode: "sticky" | "through" = "sticky") {
  const ref = useRef<T>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return onScrollFrame(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = mode === "sticky" ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (r.height + vh);
      cbRef.current(clamp01(p), el);
    });
  }, [mode]);
  return ref;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
