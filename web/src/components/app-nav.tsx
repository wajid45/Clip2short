import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCalendar,
  IconCard,
  IconChart,
  IconChevronDown,
  IconHelp,
  IconLibrary,
  IconLink,
  IconLogout,
  IconMail,
  IconMenu,
  IconSettings,
  IconSpark,
  IconUsers,
  IconVideo,
  IconX,
} from "@shortlark/shared/components/icons";
import { Logo } from "@shortlark/shared/components/logo";
import { ThemeToggle } from "@shortlark/shared/components/theme-toggle";
import { Link, usePathname, useRouter } from "@/lib/nav";
import { CreditsPopover } from "./credits-popover";

const NAV = [
  { href: "/app", label: "Videos", icon: IconVideo, exact: true },
  { href: "/app/moments", label: "Best moments", icon: IconSpark },
  { href: "/app/library", label: "Clip library", icon: IconLibrary },
  { href: "/app/queue", label: "Queue", icon: IconCalendar },
  { href: "/app/analytics", label: "Analytics", icon: IconChart },
  { href: "/app/accounts", label: "Social accounts", icon: IconLink },
];
// Billing is reached from the credits card and the account menu.

const ADMIN_NAV = [
  { href: "/admin/leads", label: "Leads", icon: IconUsers },
  { href: "/admin/messages", label: "Messages", icon: IconMail },
  { href: "/admin/integrations", label: "Integrations", icon: IconLink },
];

export interface NavUser {
  name: string;
  email: string;
  planName: string | null;
  credits: number;
  monthlyCredits: number | null;
  isAdmin: boolean;
}

const EXPANDED = 240;
const COLLAPSED = 72;

function Chevron({ left }: { left: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {left ? <path d="M12.5 4.5 7 10l5.5 5.5" /> : <path d="M7.5 4.5 13 10l-5.5 5.5" />}
    </svg>
  );
}

function savedCollapsed(): boolean {
  try {
    return /(?:^|; )sl_nav=collapsed/.test(document.cookie);
  } catch {
    return false;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Closes on outside click and Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

/** Account menu at the foot of the sidebar: settings, billing, help, theme and sign out. */
function UserMenu({ user, rail, onNavigate }: { user: NavUser; rail: boolean; onNavigate: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const item = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={rail ? `${user.name} · account menu` : undefined}
        className={clsx(
          "flex w-full items-center rounded-lg transition-colors hover:bg-surface-2",
          rail ? "justify-center p-1.5" : "gap-2.5 p-1.5 pr-2 text-left",
          open && "bg-surface-2",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal-soft text-xs font-semibold text-signal">{initials(user.name)}</span>
        {!rail && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text">{user.name}</span>
              <span className="block truncate text-xs text-faint">{user.email}</span>
            </span>
            <IconChevronDown size={16} className={clsx("shrink-0 text-faint transition-transform", !open && "rotate-180")} />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={clsx(
            "absolute z-50 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]",
            rail ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2",
          )}
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-text">{user.name}</p>
            <p className="truncate text-xs text-faint">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          {[
            { href: "/app/settings", label: "Settings", icon: IconSettings },
            { href: "/app/billing", label: "Billing", icon: IconCard },
            { href: "/app/help", label: "Help", icon: IconHelp },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-muted">
            Theme <ThemeToggle />
          </div>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" className={item} onClick={() => void logout()}>
            <IconLogout size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Workspace shell: on desktop a sidebar (collapsible to an icon rail, remembered in a cookie);
 * on tablets and phones a top bar with a slide-in drawer.
 */
export function AppShell({ user, children }: { user: NavUser; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(savedCollapsed);

  // Close the drawer on navigation, and lock page scroll while it's open.
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", key);
    };
  }, [drawer]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sl_nav=${next ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href || pathname.startsWith("/app/videos") || pathname.startsWith("/app/clips") : pathname.startsWith(href);

  const link = (rail: boolean, on: boolean) =>
    clsx(
      "flex items-center rounded-lg text-sm transition-colors",
      rail ? "h-9 justify-center" : "h-10 gap-2.5 px-2.5 lg:h-9",
      on ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
    );

  const navLinks = (rail: boolean) => (
    <nav className="flex flex-col gap-0.5" aria-label="Workspace">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const on = isActive(href, exact);
        return (
          <Link key={href} href={href} title={rail ? label : undefined} aria-label={rail ? label : undefined} aria-current={on ? "page" : undefined} className={link(rail, on)}>
            <Icon size={17} className={on ? "text-signal" : undefined} />
            {!rail && label}
          </Link>
        );
      })}
      {user.isAdmin && (
        <>
          {rail ? <div className="mx-3 my-3 h-px bg-line" /> : <p className="mt-5 mb-1 px-2.5 text-[11px] font-medium text-faint">Admin</p>}
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} title={rail ? label : undefined} aria-label={rail ? label : undefined} className={link(rail, pathname.startsWith(href))}>
              <Icon size={17} />
              {!rail && label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  const footer = (rail: boolean) => (
    <div className="space-y-2">
      <CreditsPopover credits={user.credits} planName={user.planName} monthlyCredits={user.monthlyCredits} collapsed={rail} onNavigate={() => setDrawer(false)} />
      <UserMenu user={user} rail={rail} onNavigate={() => setDrawer(false)} />
    </div>
  );

  const width = collapsed ? COLLAPSED : EXPANDED;

  return (
    <div className="min-h-dvh" style={{ ["--nav-w" as string]: `${width}px` }}>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "group/rail fixed inset-y-0 left-0 z-30 hidden flex-col justify-between border-r border-line bg-bg py-5 transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "px-2.5" : "px-3",
        )}
        style={{ width }}
      >
        <div className="min-h-0 overflow-y-auto">
          {collapsed ? (
            // Rail: the logo turns into the expand button while the pointer is over the sidebar.
            <div className="mb-7 flex justify-center">
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="group/logo relative flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <span className="transition-opacity duration-150 group-hover/rail:opacity-0 group-focus-visible/logo:opacity-0">
                  <Logo compact />
                </span>
                <span className="absolute inset-0 flex items-center justify-center text-muted opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-visible/logo:opacity-100">
                  <Chevron left={false} />
                </span>
              </button>
            </div>
          ) : (
            <div className="mb-7 flex items-center justify-between pl-2.5">
              <Link href="/app" aria-label="Shortlark home">
                <Logo />
              </Link>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex size-8 items-center justify-center rounded-lg text-faint opacity-0 transition hover:bg-surface-2 hover:text-text group-hover/rail:opacity-100 focus-visible:opacity-100"
              >
                <Chevron left />
              </button>
            </div>
          )}
          {navLinks(collapsed)}
        </div>
        {footer(collapsed)}
      </aside>

      {/* Tablet and phone: top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:px-6 lg:hidden">
        <Link href="/app" aria-label="Shortlark home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/app/billing" className="tc rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-text">
            {user.credits.toLocaleString("en-US")} credits
          </Link>
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="flex size-10 items-center justify-center rounded-lg text-text hover:bg-surface-2"
            aria-label="Open menu"
            aria-expanded={drawer}
          >
            <IconMenu size={20} />
          </button>
        </div>
      </header>
      <div className={clsx("fixed inset-0 z-40 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!drawer}>
        <div className={clsx("absolute inset-0 bg-black/60 transition-opacity duration-200", drawer ? "opacity-100" : "opacity-0")} onClick={() => setDrawer(false)} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={clsx(
            "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col justify-between border-r border-line bg-bg px-3 pt-4 pb-5 shadow-2xl transition-transform duration-200 ease-out",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="min-h-0 overflow-y-auto">
            <div className="mb-5 flex items-center justify-between pl-2.5">
              <Logo />
              <button type="button" onClick={() => setDrawer(false)} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label="Close menu">
                <IconX />
              </button>
            </div>
            {navLinks(false)}
          </div>
          {footer(false)}
        </div>
      </div>

      <main className="transition-[padding] duration-200 ease-out lg:pl-[var(--nav-w)]">
        <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
