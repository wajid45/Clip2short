import clsx from "clsx";

/** Compact, recognisable platform tiles for connect buttons and lists (simplified marks, brand colours). */
export function PlatformIcon({ platform, size = 32, className }: { platform: string; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const, className: clsx("shrink-0 rounded-[22%] ring-2 ring-bg", className) };
  switch (platform) {
    case "youtube":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="7" fill="#FF0033" />
          <rect x="6" y="9" width="20" height="14" rx="4.5" fill="#fff" />
          <path d="M14 12.6v6.8l5.6-3.4z" fill="#FF0033" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="ig-g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset=".35" stopColor="#FA7E1E" />
              <stop offset=".65" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="7" fill="url(#ig-g)" />
          <rect x="8" y="8" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="16" cy="16" r="3.8" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="21" cy="11" r="1.2" fill="#fff" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="7" fill="#1877F2" />
          <path d="M17.6 26v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.6 1.6-1.6h1.7V8.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H11.4v3.2h2.8V26z" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="32" height="32" rx="7" fill="#36363d" />
          <path d="M11 11h10v10H11z" fill="none" stroke="#ededef" strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      );
  }
}
