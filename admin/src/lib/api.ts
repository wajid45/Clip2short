import { useCallback, useEffect, useRef, useState } from "react";

/** JSON calls to the portal API (same origin; /api is proxied to the API server). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** `background: true` marks automatic refreshes, which do not count as activity for the idle sign-out. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; background?: boolean }): Promise<T> {
  const res = await fetch(`/api/portal${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: {
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init?.background ? { "X-Background": "1" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("sl-admin:signed-out"));
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.code);
  }
  return data as T;
}

/** Loads `path`, refreshes it every `everyMs` while the tab is visible, and exposes a manual refresh. */
export function useLive<T>(path: string, everyMs = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const current = useRef(path);
  current.current = path;

  const refresh = useCallback(async (background = false) => {
    setLoading(true);
    try {
      const d = await api<T>(path, { background });
      if (current.current !== path) return;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (current.current === path) setError((e as Error).message);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void refresh();
    if (!everyMs) return;
    const id = setInterval(() => document.visibilityState === "visible" && void refresh(true), everyMs);
    return () => clearInterval(id);
  }, [refresh, everyMs]);

  return { data, error, loading, updatedAt, refresh };
}

export const num = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const usd = (n: number) => `$${new Intl.NumberFormat("en-US").format(n)}`;

export function when(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const fullDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
