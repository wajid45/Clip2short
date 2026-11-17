"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Rises into view with a slight 3D tilt the first time it scrolls into the viewport. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={clsx(shown ? "animate-rise" : "opacity-0", className)}
      style={{ animationDelay: `${delay}ms`, transformOrigin: "50% 100%" }}
    >
      {children}
    </div>
  );
}

/** Card that tilts toward the pointer in 3D on hover. */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="stage-3d h-full">
      <div
        ref={ref}
        className={clsx("preserve-3d h-full transition-transform duration-200 ease-out will-change-transform", className)}
        onPointerMove={(e) => {
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          e.currentTarget.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateZ(6px)`;
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.transform = "";
        }}
      >
        {children}
      </div>
    </div>
  );
}
