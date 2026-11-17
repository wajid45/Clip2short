import clsx from "clsx";
import Image from "next/image";

/**
 * Shortlark mark: a lark in flight sweeping through a play button, orange to red.
 * Transparent PNG so it sits on both the light and dark themes.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={size <= 64 ? "/brand/logo-mark-128.png" : "/brand/logo-mark.png"}
      alt=""
      width={size}
      height={size}
      priority={size <= 64}
      className={clsx("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

export function Logo({ className, size = 26, compact = false }: { className?: string; tone?: "light" | "dark"; size?: number; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <LogoMark size={size} />
      {!compact && <span className="text-[18px] font-semibold tracking-[-0.035em] text-text">shortlark</span>}
    </span>
  );
}
