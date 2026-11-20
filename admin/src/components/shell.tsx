import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { LogoMark } from "@shortlark/shared/components/logo";
import { IconChart, IconLogout, IconMail, IconMenu, IconShield, IconUsers, IconX } from "@shortlark/shared/components/icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cx } from "./ui";

const NAV = [
  {
    group: "Business",
    items: [
      { to: "/", label: "Overview", icon: IconChart, end: true },
      { to: "/users", label: "Users", icon: IconUsers, end: false },
      { to: "/messages", label: "Messages", icon: IconMail, end: false, badge: true },
    ],
  },
  {
    group: "Account",
    items: [{ to: "/security", label: "My Authenticator", icon: IconShield, end: false }],
  },
];

const RAIL_KEY = "sl_admin_rail";

function Brand({ rail }: { rail: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={26} />
      {!rail && (
        <>
          <span className="text-[17px] font-semibold tracking-[-0.03em] text-text">shortlark</span>
          <span className="rounded-md border border-signal/40 bg-signal-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-signal uppercase">Admin</span>
        </>
      )}
    </span>
  );
}

export function ThemeButton() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    document.cookie = `sl_admin_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=strict`;
  };
  return (
    <button type="button" onClick={toggle} title="Light or dark theme" aria-label="Toggle light or dark theme" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1" />
      </svg>
    </button>
  );
}

/** Open contact messages, refreshed every minute and when a message is marked. */
function useOpenMessages() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => void api<{ openMessages: number }>("/badges", { background: true }).then((b) => setN(b.openMessages), () => {});
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    window.addEventListener("sl-admin:badges", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("sl-admin:badges", load);
    };
  }, []);
  return n;
}

function NavItems({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const open = useOpenMessages();
  return (
    <nav aria-label="Admin" className="space-y-6">
      {NAV.map((g) => (
        <div key={g.group}>
          {!rail && <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-faint uppercase">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map(({ to, label, icon: Icon, end, ...rest }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  title={rail ? label : undefined}
                  className={({ isActive }) =>
                    cx(
                      "group relative flex h-9 items-center gap-3 rounded-lg text-sm transition-colors",
                      rail ? "justify-center" : "px-3",
                      isActive ? "bg-signal-soft text-signal" : "text-muted hover:bg-surface-2 hover:text-text",
                    )
                  }
                >
                  <Icon size={17} />
                  {!rail && <span className="flex-1">{label}</span>}
                  {"badge" in rest && open > 0 && (
                    <span className={cx("rounded-full bg-signal px-1.5 text-[11px] leading-[18px] font-semibold text-on-signal", rail && "absolute -top-1 -right-1")}>{open > 99 ? "99+" : open}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [rail]);
  // "[" toggles the rail, like the reference console.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "[" && !/input|textarea|select/i.test(t.tagName)) setRail((r) => !r);
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const account = (
    <div className={cx("border-t border-line pt-3", rail && "flex flex-col items-center")}>
      {!rail && me && (
        <div className="mb-2 px-3">
          <p className="truncate text-[13px] font-medium text-text">{me.name || "Admin"}</p>
          <p className="truncate text-xs text-faint">{me.email}</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        title="Sign out"
        className={cx("flex h-9 items-center gap-3 rounded-lg text-sm text-muted hover:bg-surface-2 hover:text-text", rail ? "w-9 justify-center" : "w-full px-3")}
      >
        <IconLogout size={17} />
        {!rail && "Sign out"}
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className={cx("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface px-3 py-4 transition-[width] duration-200 lg:flex", rail ? "w-[68px]" : "w-[248px]")}>
        <div className={cx("mb-6 flex items-center", rail ? "justify-center" : "justify-between px-2")}>
          <NavLink to="/" aria-label="Admin home">
            <Brand rail={rail} />
          </NavLink>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavItems rail={rail} />
        </div>
        {account}
        <button
          type="button"
          onClick={() => setRail((r) => !r)}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={`${rail ? "Expand" : "Collapse"} sidebar ( [ )`}
          className="absolute top-20 -right-3 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-text"
        >
          <svg viewBox="0 0 16 16" className={cx("size-3 transition-transform", rail && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      </aside>

      {/* Top bar */}
      <header className={cx("sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6", rail ? "lg:pl-[92px]" : "lg:pl-[272px]")}>
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="flex size-9 items-center justify-center rounded-lg text-text hover:bg-surface-2">
            <IconMenu size={20} />
          </button>
          <Brand rail={false} />
        </div>
        <p className="hidden text-[13px] text-faint lg:block">Operator console · changes here affect real customers</p>
        <ThemeButton />
      </header>

      {/* Phone and tablet drawer */}
      <div className={cx("fixed inset-0 z-40 lg:hidden", drawer ? "" : "pointer-events-none")} aria-hidden={!drawer}>
        <div className={cx("absolute inset-0 bg-black/60 transition-opacity", drawer ? "opacity-100" : "opacity-0")} onClick={() => setDrawer(false)} />
        <div className={cx("absolute inset-y-0 left-0 flex w-[280px] flex-col bg-surface px-3 py-4 shadow-2xl transition-transform duration-200", drawer ? "translate-x-0" : "-translate-x-full")}>
          <div className="mb-6 flex items-center justify-between px-2">
            <Brand rail={false} />
            <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
              <IconX />
            </button>
          </div>
          <div className="flex-1">
            <NavItems rail={false} onNavigate={() => setDrawer(false)} />
          </div>
          {account}
        </div>
      </div>

      <main className={cx("px-4 py-6 sm:px-6 sm:py-8", rail ? "lg:pl-[92px]" : "lg:pl-[272px]")}>
        <div className="mx-auto max-w-[1360px]">{children}</div>
      </main>
    </div>
  );
}
