import type { SVGProps } from "react";

/** Small, consistent stroke icon set (1.6px strokes on a 20px grid). */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconVideo = (p: P) => (
  <Icon {...p}><rect x="2.5" y="4.5" width="11" height="11" rx="2" /><path d="m13.5 8.5 4-2.2v7.4l-4-2.2" /></Icon>
);
export const IconSpark = (p: P) => (
  <Icon {...p}><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.7 4.7l2.1 2.1M13.2 13.2l2.1 2.1M4.7 15.3l2.1-2.1M13.2 6.8l2.1-2.1" /></Icon>
);
export const IconLibrary = (p: P) => (
  <Icon {...p}><rect x="3" y="3" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" /></Icon>
);
export const IconCalendar = (p: P) => (
  <Icon {...p}><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></Icon>
);
export const IconChart = (p: P) => (
  <Icon {...p}><path d="M3 17h14M5.5 14V9M10 14V5M14.5 14v-3" /></Icon>
);
export const IconLink = (p: P) => (
  <Icon {...p}><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" /></Icon>
);
export const IconCard = (p: P) => (
  <Icon {...p}><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M2.5 8.5h15M5.5 12.5h3" /></Icon>
);
export const IconPlay = (p: P) => (
  <Icon {...p}><path d="M6 4.5v11l9-5.5z" fill="currentColor" stroke="none" /></Icon>
);
export const IconPause = (p: P) => (
  <Icon {...p}><path d="M7 4.5v11M13 4.5v11" strokeWidth={2.4} /></Icon>
);
export const IconArrowLeft = (p: P) => (
  <Icon {...p}><path d="M16 10H4M9 5l-5 5 5 5" /></Icon>
);
export const IconArrowRight = (p: P) => (
  <Icon {...p}><path d="M4 10h12M11 5l5 5-5 5" /></Icon>
);
export const IconExternal = (p: P) => (
  <Icon {...p}><path d="M11 3.5h5.5V9M16.5 3.5 9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8" /></Icon>
);
export const IconTrash = (p: P) => (
  <Icon {...p}><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11" /></Icon>
);
export const IconDownload = (p: P) => (
  <Icon {...p}><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M3.5 16.5h13" /></Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}><path d="m4 10.5 4 4 8-9" /></Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}><path d="M5 5l10 10M15 5 5 15" /></Icon>
);
export const IconSearch = (p: P) => (
  <Icon {...p}><circle cx="9" cy="9" r="5.5" /><path d="m13 13 4 4" /></Icon>
);
export const IconRefresh = (p: P) => (
  <Icon {...p}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" /></Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}><path d="M10 4v12M4 10h12" /></Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2" /></Icon>
);
export const IconSend = (p: P) => (
  <Icon {...p}><path d="M17 3 8.5 11.5M17 3l-5 14-3.5-5.5L3 8z" /></Icon>
);
export const IconLogout = (p: P) => (
  <Icon {...p}><path d="M12 4.5V3.5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1M8 10h9M14 7l3 3-3 3" /></Icon>
);
export const IconUsers = (p: P) => (
  <Icon {...p}><circle cx="7.5" cy="7" r="3" /><path d="M2.5 16.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4M13 4.2a3 3 0 0 1 0 5.6M14.5 12.7c1.5.5 2.6 1.9 3 3.8" /></Icon>
);
export const IconInfo = (p: P) => (
  <Icon {...p}><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.1" /></Icon>
);
export const IconStepBack = (p: P) => (
  <Icon {...p}><path d="M15 5 9 10l6 5zM5 5v10" /></Icon>
);
export const IconStepFwd = (p: P) => (
  <Icon {...p}><path d="m5 5 6 5-6 5zM15 5v10" /></Icon>
);
