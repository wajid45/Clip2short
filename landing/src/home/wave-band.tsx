import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../motion/frame";

/**
 * A strip of tape that waves across the page with words running along it, the seam between
 * two colour blocks. The words drift on their own and speed up with the scroll, in whichever
 * direction you are scrolling.
 */

const UNIT = "Find it · Clip it · Post it · ";
const PATH =
  "M -3200,330 Q -2800,450 -2400,330 Q -2000,210 -1600,330 Q -1200,450 -800,330 Q -400,210 0,330 Q 400,450 800,330 Q 1200,210 1600,330 Q 2000,450 2400,330 Q 2800,210 3200,330 Q 3600,450 4000,330 Q 4400,210 4800,330";

export function WaveBand({ id, tone, reverse = false, text = UNIT }: { id: string; tone: "gold" | "vice"; reverse?: boolean; text?: string }) {
  const textRef = useRef<SVGTextPathElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const textEl = el.parentElement as unknown as SVGTextElement;
    let unit = 0;
    try {
      unit = textEl.getSubStringLength(0, text.length);
    } catch {
      unit = 0;
    }
    if (!unit || prefersReducedMotion()) return;
    let offset = 0,
      raf = 0,
      lastY = window.scrollY,
      boost = 0,
      last = performance.now();
    const dir = reverse ? -1 : 1;
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const y = window.scrollY;
      boost += (y - lastY) * 0.9;
      lastY = y;
      boost *= 0.9;
      offset += dir * (dt * 0.05 + boost * 0.12);
      offset = ((offset % unit) + unit) % unit;
      el.setAttribute("startOffset", String(400 + offset - unit));
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !raf) {
        last = performance.now();
        lastY = window.scrollY;
        raf = requestAnimationFrame(tick);
      } else if (!e.isIntersecting && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(textEl.ownerSVGElement ?? (textEl as unknown as Element));
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reverse, text]);

  const pathId = `wave-${id}`;
  const fill = tone === "gold" ? "var(--color-gold)" : "var(--color-vice)";
  return (
    <svg className="wave-band block w-full" viewBox="-80 120 1760 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <path id={pathId} d={PATH} fill="none" />
      </defs>
      <use href={`#${pathId}`} stroke="rgb(0 0 0 / 0.25)" strokeWidth="112" fill="none" transform="translate(0 10)" />
      <use href={`#${pathId}`} stroke={fill} strokeWidth="108" fill="none" />
      <text className="wave-text" dominantBaseline="central">
        <textPath ref={textRef} href={`#${pathId}`} startOffset="400">
          {text.repeat(16)}
        </textPath>
      </text>
    </svg>
  );
}
