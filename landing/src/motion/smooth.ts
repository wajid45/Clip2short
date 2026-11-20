import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { prefersReducedMotion } from "./frame";

/** Inertia scrolling for the whole site (the same feel as the reference studios). Off for reduced motion. */

let lenis: Lenis | null = null;

export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return () => {};
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.11,
    wheelMultiplier: 0.95,
    // In-page links (#pricing, #faq) glide instead of jumping. Sections carry their own top
    // padding (taller than the fixed header), so land exactly on the section's top edge.
    anchors: true,
  });
  return () => {
    lenis?.destroy();
    lenis = null;
  };
}

/** Freeze page scrolling while an overlay (the menu) is open. */
export function lockScroll(locked: boolean) {
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = locked ? "hidden" : "";
}
