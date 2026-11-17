import clsx from "clsx";
import { IconVideo } from "./icons";

/* eslint-disable @next/next/no-img-element -- remote thumbnails from many CDNs; no optimisation needed */
export function Thumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={clsx("relative aspect-video overflow-hidden rounded-lg bg-surface-3", className)}>
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-full items-center justify-center text-faint">
          <IconVideo size={22} />
        </div>
      )}
    </div>
  );
}
