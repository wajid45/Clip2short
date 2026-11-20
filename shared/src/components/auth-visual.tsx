import clsx from "clsx";

/**
 * The photo half of every sign-in page (web app and admin portal), so they all match.
 * Photos are from Pexels (free to use under the Pexels license, no attribution required; we credit anyway).
 */

export interface AuthPhoto {
  src: string;
  alt: string;
  credit: string;
}

const px = (id: number, path: string) => `https://images.pexels.com/photos/${id}/${path}?auto=compress&cs=tinysrgb&w=1600`;

export const AUTH_PHOTOS = {
  signin: { src: px(15713296, "pexels-photo-15713296/free-photo-of-man-editing-a-film-on-the-computer.jpeg"), alt: "An editor cutting a video on two screens in a dark room", credit: "Pexels" },
  signup: { src: px(5382381, "pexels-photo-5382381.jpeg"), alt: "A streaming setup with two monitors and a microphone", credit: "Pexels" },
  reset: { src: px(31726559, "pexels-photo-31726559/free-photo-of-modern-podcasting-setup-with-microphone.jpeg"), alt: "A podcast microphone in front of a computer screen", credit: "Pexels" },
  admin: { src: px(8100060, "pexels-photo-8100060.jpeg"), alt: "A video editor working on dual monitors", credit: "Pexels" },
} satisfies Record<string, AuthPhoto>;

export function AuthPhotoPanel({
  photo,
  title,
  accent,
  points,
  className,
}: {
  photo: AuthPhoto;
  /** Kept for callers; no longer shown on the photo. */
  eyebrow?: string;
  title: string;
  /** Second line of the headline, set in italic with the sunset gradient. */
  accent?: string;
  points?: string[];
  className?: string;
}) {
  return (
    <div
      className={clsx("relative isolate flex flex-col overflow-hidden bg-[#0b0c10] text-white", className)}
      style={{ backgroundImage: "radial-gradient(80% 60% at 20% 100%, rgba(217,72,15,0.45), transparent 70%), radial-gradient(70% 60% at 100% 0%, rgba(132,73,199,0.35), transparent 70%)" }}
    >
      {/* Fades in once loaded, over the gradient above. */}
      <img
        src={photo.src}
        alt={photo.alt}
        className="absolute inset-0 -z-10 size-full object-cover opacity-0 transition-opacity duration-700"
        loading="eager"
        decoding="async"
        onLoad={(e) => (e.currentTarget.style.opacity = "1")}
        ref={(el) => {
          if (el?.complete && el.naturalWidth) el.style.opacity = "1";
        }}
      />
      {/* Darken for legibility and tint toward the brand sunset. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/20" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 opacity-70 mix-blend-soft-light"
        style={{ background: "radial-gradient(70% 50% at 20% 100%, #fe864a, transparent 70%), radial-gradient(60% 50% at 100% 0%, #8449c7, transparent 70%)" }}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col justify-end p-7 sm:p-12">
        <h2 className="max-w-md font-display text-[clamp(32px,3.2vw,48px)] leading-[1.02] tracking-[-0.02em]">
          {title}
          {accent && (
            <>
              <br />
              <span className="italic" style={{ background: "linear-gradient(135deg,#ff7a6b,#fe864a,#ffa73b)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", paddingRight: "0.08em", paddingBottom: "0.12em" }}>
                {accent}
              </span>
            </>
          )}
        </h2>
        {points && (
          <ul className="mt-6 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-[15px] text-white/85">
                <span aria-hidden="true" className="mt-[8px] size-1.5 shrink-0 rounded-full bg-[#ff7a2e]" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
