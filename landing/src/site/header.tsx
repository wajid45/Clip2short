import clsx from "clsx";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type SVGProps } from "react";
import { Logo } from "@shortlark/shared/components/logo";
import { ThemeToggle } from "@shortlark/shared/components/theme-toggle";
import {
  IconCalendar,
  IconChart,
  IconChevronDown,
  IconHelp,
  IconInfo,
  IconLibrary,
  IconMail,
  IconShield,
  IconSpark,
  IconUsers,
  IconVideo,
} from "@shortlark/shared/components/icons";
import { TRIAL } from "@shortlark/shared/plans";
import { appHref } from "../config";
import { lockScroll } from "../motion/smooth";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
interface Item {
  href: string;
  label: string;
  desc: string;
  icon: Icon;
}

export const MENUS: { label: string; items: Item[] }[] = [
  {
    label: "Product",
    items: [
      { href: "/features", label: "Features", desc: "Everything from moment to posted clip", icon: IconSpark },
      { href: "/engines", label: "Category engines", desc: "One AI engine per kind of video", icon: IconVideo },
      { href: "/integrations", label: "Integrations", desc: "YouTube, Instagram and Facebook", icon: IconCalendar },
      { href: "/changelog", label: "Changelog", desc: "What's new", icon: IconChart },
    ],
  },
  {
    label: "Use cases",
    items: [
      { href: "/use-cases/streamers", label: "Streamers and clippers", desc: "Marathon VODs into daily Shorts", icon: IconVideo },
      { href: "/use-cases/podcasters", label: "Podcasters", desc: "Episodes into quotable Reels", icon: IconSpark },
      { href: "/use-cases/agencies", label: "Agencies and editors", desc: "Many channels, one queue", icon: IconUsers },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/guides", label: "Guides", desc: "Find moments, write hooks, clip right", icon: IconLibrary },
      { href: "/faq", label: "FAQ", desc: "Credits, sources and captions", icon: IconHelp },
      { href: "/compare", label: "Compare", desc: "Shortlark or clipping by hand", icon: IconChart },
      { href: "/security", label: "Security", desc: "How we protect your data", icon: IconShield },
      { href: "/about", label: "About", desc: "Who we are and why we built it", icon: IconInfo },
      { href: "/contact", label: "Contact", desc: "Sales, support and partnerships", icon: IconMail },
    ],
  },
];

/** The big links in the full-screen menu. */
const PRIMARY: [string, string][] = [
  ["Features", "/features"],
  ["Pricing", "/pricing"],
  ["Category engines", "/engines"],
  ["Guides", "/guides"],
  ["FAQ", "/faq"],
  ["Contact", "/contact"],
];

function DesktopMenu({ menu, open, onToggle, onClose }: { menu: (typeof MENUS)[number]; open: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="relative" onMouseLeave={onClose}>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => !open && onToggle()}
        aria-expanded={open}
        aria-haspopup="true"
        className={clsx("ulink inline-flex h-9 items-center gap-1", open && "is-active")}
      >
        {menu.label}
        <IconChevronDown size={13} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {/* The padding bridges the gap so the pointer can travel into the panel. */}
      <div
        className={clsx(
          "absolute top-full left-1/2 z-50 -translate-x-1/2 pt-3 transition duration-200",
          open ? "visible opacity-100" : "invisible translate-y-1 opacity-0",
        )}
      >
        <div className="w-[360px] overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
          {menu.items.map((it) => (
            <a key={it.label} href={it.href} onClick={onClose} className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg text-signal transition-colors group-hover:border-signal">
                <it.icon size={16} />
              </span>
              <span>
                <span className="block text-[16px] leading-tight text-text">{it.label}</span>
                <span className="mt-0.5 block text-[14px] text-muted">{it.desc}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className={clsx(
        "menu-btn relative flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-text transition-colors hover:border-text",
        open && "is-open",
        className,
      )}
    >
      <span className="menu-lines" aria-hidden="true">
        <i />
        <i />
      </span>
    </button>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Scrolling up brings the full bar back; scrolling down leaves only the logo and the buttons.
  const [up, setUp] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 90);
      if (Math.abs(y - lastY) > 6) {
        setUp(y < lastY);
        lastY = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const down = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMenu(false);
      }
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => {
    lockScroll(menu);
    return () => lockScroll(false);
  }, [menu]);

  const close = () => setMenu(false);
  const full = !scrolled || up;

  return (
    <>
      <header className={clsx(
          "site-header fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300",
          !menu && scrolled && (up ? "is-bar" : "is-compact"),
        )}>
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-8">
          <a href="/" aria-label="Shortlark home" className="hdr-pill relative z-10 shrink-0">
            <Logo size={29} />
          </a>

          {/* Full navigation at the top of the page; it folds away into the menu button once you scroll. */}
          <nav
            ref={navRef}
            aria-label="Main"
            className={clsx("hidden items-center gap-7 transition duration-300 lg:flex", full ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0")}
          >
            {MENUS.map((m) => (
              <DesktopMenu
                key={m.label}
                menu={m}
                open={open === m.label}
                onToggle={() => setOpen((o) => (o === m.label ? null : m.label))}
                onClose={() => setOpen(null)}
              />
            ))}
            <a href="/pricing" className="ulink inline-flex h-9 items-center">
              Pricing
            </a>
          </nav>

          <div className="hdr-pill relative z-10 flex items-center gap-2 sm:gap-3">
            {/* At the top of a desktop page: theme and sign in sit in the bar. Once you scroll (and on
                tablets and phones) the bar keeps only the logo, Start free and the menu; both live in the menu. */}
            {full && (
              <span className="hidden lg:flex">
                <ThemeToggle />
              </span>
            )}
            <a
              href={appHref("/signup")}
              className="inline-flex h-10 items-center rounded-full bg-signal px-4 text-[15px] text-on-signal transition-colors hover:bg-signal-strong sm:h-11 sm:px-5"
            >
              Start free
            </a>
            <MenuButton open={menu} onClick={() => setMenu((m) => !m)} className={clsx(full && "lg:hidden")} />
          </div>
        </div>
      </header>

      {/* Full-screen menu. Outside the header: the header's backdrop blur would otherwise trap this fixed panel. */}
      <div className={clsx("site-menu fixed inset-0 z-30", menu && "is-open")} aria-hidden={!menu} inert={!menu}>
        <div className="site-menu-sheet absolute inset-0 overflow-y-auto bg-bg">
          <div className="mx-auto grid min-h-full max-w-[1400px] content-start gap-10 px-4 pt-24 pb-8 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-16 lg:pt-32">
            {/* Main links: one row each, with an arrow that lights up */}
            <nav aria-label="Menu">
              <ul className="border-t border-line">
                {PRIMARY.map(([label, href], i) => (
                  <li key={label} className="menu-item overflow-hidden border-b border-line" style={{ "--i": i } as CSSProperties}>
                    <a href={href} onClick={close} className="group flex items-center gap-4 py-3.5 sm:py-4">
                      <span className="hud w-7 shrink-0 text-faint transition-colors group-hover:text-signal">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 text-[clamp(30px,5vw,56px)] leading-none tracking-[-0.03em] transition-transform duration-300 group-hover:translate-x-2">
                        {label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors group-hover:border-signal group-hover:bg-signal group-hover:text-on-signal"
                      >
                        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 11L11 5M6 5h5v5" />
                        </svg>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-6">
              {/* Shortcuts to the features and audiences, as tags */}
              {MENUS.slice(0, 2).map((m) => (
                <div key={m.label}>
                  <p className="hud text-muted">{m.label}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.items
                      .filter((it) => it.label !== "How it works")
                      .map((it) => (
                        <a
                          key={it.label}
                          href={it.href}
                          onClick={close}
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-[15px] text-text transition-colors hover:border-signal hover:text-signal"
                        >
                          <it.icon size={15} className="text-signal" />
                          {it.label}
                        </a>
                      ))}
                  </div>
                </div>
              ))}

              {/* The call to action, as the dark CTA card */}
              <div className="relative mt-2 overflow-hidden rounded-[24px] bg-[#0d0e12] p-6 text-white sm:p-7">
                <div className="plan-glow pointer-events-none absolute inset-x-0 -top-20 h-48" aria-hidden="true" />
                <p className="relative text-[26px] leading-tight tracking-[-0.02em]">
                  Start with <span className="text-sunset font-display italic">{TRIAL.credits} free credits</span>
                </p>
                <p className="relative mt-1 text-[15px] text-white/60">No card required. Cancel anytime.</p>
                <div className="relative mt-5 grid grid-cols-2 gap-3">
                  <a href={appHref("/signup")} className="flex h-11 items-center justify-center rounded-full bg-signal text-[15px] text-on-signal hover:bg-signal-strong">
                    Start free
                  </a>
                  <a href={appHref("/login")} className="flex h-11 items-center justify-center rounded-full border border-white/25 text-[15px] text-white hover:border-white">
                    Sign in
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
                <span className="text-[15px] text-muted">Appearance</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
