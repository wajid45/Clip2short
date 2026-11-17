"use client";

import { useEffect, useRef } from "react";
import { ShortCard } from "./short-card";

/**
 * 3D phone stage: three vertical Shorts fanned out in perspective, floating, and tilting
 * toward the pointer. Pure CSS transforms driven by one rAF loop; static when reduced motion is on.
 */
export function HeroStage() {
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = stage.current;
    const r = rig.current;
    if (!el || !r) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      tx = ((e.clientX - (b.left + b.width / 2)) / b.width) * 2; // -1..1
      ty = ((e.clientY - (b.top + b.height / 2)) / b.height) * 2;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      r.style.transform = `rotateX(${(-cy * 7 + 8).toFixed(2)}deg) rotateY(${(cx * 12 - 6).toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={stage} className="stage-3d relative mx-auto h-[460px] w-full max-w-[560px] sm:h-[560px]" aria-hidden="true">
      {/* glow */}
      <div className="absolute top-1/2 left-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/25 blur-[90px]" />
      <div
        ref={rig}
        className="preserve-3d absolute inset-0 transition-transform duration-300 ease-out"
        style={{ transform: "rotateX(8deg) rotateY(-6deg)" }}
      >
        {/* left */}
        <div className="preserve-3d absolute top-[12%] left-[2%] w-[38%]" style={{ transform: "translateZ(-120px) rotateY(24deg) rotateZ(-4deg)" }}>
          <div className="animate-float" style={{ animationDelay: "-2s" }}>
            <ShortCard palette="neon" handle="nightshiftclips" caption={["he", "did", "NOT", "see", "that", "coming"]} hot={2} score={88} time="0:33" likes="48.2K" comments="1.1K" progressDelay="-2s" />
          </div>
        </div>
        {/* right */}
        <div className="preserve-3d absolute top-[12%] right-[2%] w-[38%]" style={{ transform: "translateZ(-120px) rotateY(-24deg) rotateZ(4deg)" }}>
          <div className="animate-float" style={{ animationDelay: "-4.5s" }}>
            <ShortCard palette="dawn" handle="pixelheistclips" caption={["the", "chat", "went", "INSANE"]} hot={3} score={81} time="0:52" likes="21.7K" comments="640" progressDelay="-4s" />
          </div>
        </div>
        {/* center */}
        <div className="preserve-3d absolute top-[2%] left-1/2 w-[44%]" style={{ transform: "translateX(-50%) translateZ(80px)" }}>
          <div className="animate-float">
            <ShortCard palette="sunset" handle="lateshiftclips" caption={["one", "shot.", "ZERO", "hesitation"]} hot={2} score={94} time="0:41" likes="132K" comments="3.4K" />
          </div>
          {/* floating score chip */}
          <div
            className="absolute -right-[46%] top-[6%] w-44 rounded-xl border border-line bg-surface/95 p-3 text-left shadow-xl backdrop-blur"
            style={{ transform: "translateZ(60px)" }}
          >
            <p className="text-[11px] text-muted">Virality score</p>
            <p className="tc text-2xl font-semibold text-text">94</p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted">
              <span>Hook <b className="tc text-text">97</b></span>
              <span>Payoff <b className="tc text-text">91</b></span>
              <span>Stands alone <b className="tc text-text">88</b></span>
              <span>Quotable <b className="tc text-text">90</b></span>
            </div>
          </div>
          {/* floating timecode chip */}
          <div
            className="absolute -left-[36%] bottom-[16%] rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-xl backdrop-blur"
            style={{ transform: "translateZ(50px)" }}
          >
            <p className="text-[10px] text-muted">From a 6h 12m stream</p>
            <p className="tc text-sm font-medium text-signal">3:41:07 → 3:41:48</p>
          </div>
        </div>
      </div>
    </div>
  );
}
