"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  IconCalendar,
  IconCard,
  IconChart,
  IconLibrary,
  IconLink,
  IconLogout,
  IconSpark,
  IconUsers,
  IconVideo,
  IconX,
} from "./icons";
import { Logo } from "./logo";
import { ThemeToggle, type ThemeChoice } from "./theme-toggle";
import { CreditsPopover } from "./credits-popover";

const NAV = [
  { href: "/app", label: "Videos", icon: IconVideo, exact: true },
  { href: "/app/moments", label: "Best moments", icon: IconSpark },
  { href: "/app/library", label: "Clip library", icon: IconLibrary },
  { href: "/app/queue", label: "Queue", icon: IconCalendar },
  { href: "/app/analytics", label: "Analytics", icon: IconChart },
  { href: "/app/accounts", label: "Social accounts", icon: IconLink },
  { href: "/app/billing", label: "Billing", icon: IconCard },
];

const ADMIN_NAV = [
  { href: "/admin/leads", label: "Leads", icon: IconUsers },
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

/**
 * Workspace shell: the sidebar (collapsible to an icon rail on desktop, a drawer on mobile)
 * and the page area. The collapsed state is remembered in a cookie so it renders without a jump.
 */
export function AppShell({
  user,
  theme,
  initialCollapsed,
  children,
}: {
  user: NavUser;
  theme: ThemeChoice;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sl_nav=${next ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href || pathname.startsWith("/app/videos") || pathname.startsWith("/app/clips") : pathname.startsWith(href);

  const navLinks = (rail: boolean) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const on = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setDrawer(false)}
            title={rail ? label : undefined}
            aria-label={rail ? label : undefined}
            className={clsx(
              "flex h-9 items-center rounded-lg text-sm transition-colors",
              rail ? "justify-center" : "gap-2.5 px-2.5",
              on ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
            )}
          >
            <Icon size={17} className={on ? "text-signal" : undefined} />
            {!rail && label}
          </Link>
        );
      })}
      {user.isAdmin && (
        <>
          {rail ? <div className="mx-3 my-3 h-px bg-line" /> : <p className="mt-5 mb-1 px-2.5 text-[11px] font-medium text-faint">Admin</p>}
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawer(false)}
              title={rail ? label : undefined}
              aria-label={rail ? label : undefined}
              className={clsx(
                "flex h-9 items-center rounded-lg text-sm transition-colors",
                rail ? "justify-center" : "gap-2.5 px-2.5",
                pathname.startsWith(href) ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
              )}
            >
              <Icon size={17} />
              {!rail && label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  const footer = (rail: boolean) => (
    <div className="space-y-3">
      <CreditsPopover
        credits={user.credits}
        planName={user.planName}
        monthlyCredits={user.monthlyCredits}
        collapsed={rail}
        onNavigate={() => setDrawer(false)}
      />
      {rail ? (
        <div className="flex flex-col items-center gap-1">
          <ThemeToggle initial={theme} />
          <button onClick={logout} className="flex size-9 items-center justify-center rounded-lg text-faint hover:bg-surface-2 hover:text-text" title="Sign out" aria-label="Sign out">
            <IconLogout size={17} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-text">{user.name}</p>
            <p className="truncate text-xs text-faint">{user.email}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle initial={theme} />
            <button onClick={logout} className="flex size-9 items-center justify-center rounded-lg text-faint hover:bg-surface-2 hover:text-text" title="Sign out" aria-label="Sign out">
              <IconLogout size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const width = collapsed ? COLLAPSED : EXPANDED;

  return (
    <div className="min-h-dvh" style={{ ["--nav-w" as string]: `${width}px` }}>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 hidden flex-col justify-between border-r border-line bg-bg py-5 transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "px-2.5" : "px-3",
        )}
        style={{ width }}
      >
        <div>
          <div className={clsx("mb-7 flex items-center", collapsed ? "flex-col gap-3" : "justify-between pl-2.5")}>
            <Link href="/app" aria-label="Shortlark home">
              <Logo compact={collapsed} />
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Chevron left={!collapsed} />
            </button>
          </div>
          {navLinks(collapsed)}
        </div>
        {footer(collapsed)}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="Shortlark home">
          <Logo />
        </Link>
        <button onClick={() => setDrawer(true)} className="rounded-md px-2 py-1 text-sm text-muted hover:text-text" aria-label="Open menu">
          Menu
        </button>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between border-r border-line bg-bg px-3 py-5">
            <div>
              <div className="mb-6 flex items-center justify-between px-2.5">
                <Logo />
                <button onClick={() => setDrawer(false)} className="text-muted" aria-label="Close menu">
                  <IconX />
                </button>
              </div>
              {navLinks(false)}
            </div>
            {footer(false)}
          </div>
        </div>
      )}

      <main className="transition-[padding] duration-200 ease-out lg:pl-[var(--nav-w)]">
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
