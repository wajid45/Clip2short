import { LogoMark } from "@shortlark/shared/components/logo";

/**
 * Opening curtain on the home page: the mark on a sheet, then brand-coloured panels with a
 * curved lower edge sweep up one after another to uncover the hero. Pure CSS, so it plays
 * even before JavaScript loads, and it shows once per browser session (the head script adds
 * html.intro-seen on later page views). Skipped entirely for reduced motion.
 */
const PANELS = ["var(--color-signal)", "var(--color-vice)", "var(--color-gold)", "#0b0c10"];

export function Intro() {
  return (
    <div className="intro" aria-hidden="true">
      {PANELS.map((c, i) => (
        <div key={c} className="intro-panel" style={{ background: c, zIndex: PANELS.length - i, ["--i" as string]: i + 1 }} />
      ))}
      <div className="intro-panel intro-sheet" style={{ zIndex: 10, ["--i" as string]: 0 }}>
        <div className="intro-mark">
          <LogoMark size={64} />
          <span className="hud mt-4 text-muted">Finding the moments</span>
        </div>
      </div>
    </div>
  );
}
