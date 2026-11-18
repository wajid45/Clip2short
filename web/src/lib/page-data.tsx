import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Jsonify } from "@shortlark/shared/json";
import { PageLoader } from "@/components/page-loader";
import { ButtonLink, EmptyState } from "@/components/ui";
import { REFRESH_EVENT } from "./nav";

type State<T> =
  | { status: "loading"; data: T | null }
  | { status: "ready"; data: T }
  | { status: "redirect"; to: string; data: T | null }
  | { status: "missing"; data: T | null }
  | { status: "error"; message: string; data: T | null };

/**
 * Loads a screen's data from /api/page/<path>. Signed-out visitors go to sign in, users out of
 * credits go to Billing, and anything that isn't theirs shows a 404. Re-fetches on refreshPageData().
 */
export function usePageData<T>(path: string) {
  const location = useLocation();
  const [state, setState] = useState<State<Jsonify<T>>>({ status: "loading", data: null });
  const seq = useRef(0);

  const load = useCallback(
    async (quiet: boolean) => {
      const id = ++seq.current;
      if (!quiet) setState((s) => ({ status: "loading", data: s.data }));
      try {
        const res = await fetch(`/api/page${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (id !== seq.current) return;
        if (res.status === 401) {
          const next = encodeURIComponent(location.pathname + location.search);
          setState((s) => ({ status: "redirect", to: `/login?next=${next}`, data: s.data }));
          return;
        }
        if (res.status === 402) {
          setState((s) => ({ status: "redirect", to: "/app/billing?required=1", data: s.data }));
          return;
        }
        if (res.status === 404) {
          setState((s) => ({ status: "missing", data: s.data }));
          return;
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setState({ status: "ready", data: body as Jsonify<T> });
      } catch (e) {
        if (id !== seq.current) return;
        setState((s) => ({ status: "error", message: (e as Error).message, data: s.data }));
      }
    },
    // location is read for the sign-in return path only; path changes drive reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load(true);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [load]);

  return { state, reload: () => load(true) };
}

/** Renders a screen once its data is in, with the shared loader, redirects and error states. */
export function PageData<T>({
  path,
  title,
  children,
}: {
  path: string;
  title?: string | ((data: Jsonify<T>) => string);
  children: (data: Jsonify<T>) => ReactNode;
}) {
  const { state, reload } = usePageData<T>(path);
  const data = state.data;
  const resolvedTitle = data && typeof title === "function" ? title(data) : typeof title === "string" ? title : null;
  useTitle(resolvedTitle);

  if (state.status === "redirect") return <Navigate to={state.to} replace />;
  if (state.status === "missing") return <NotFound />;
  if (state.status === "error" && !data)
    return (
      <EmptyState
        title="This page didn't load"
        body={state.message}
        action={
          <button onClick={() => void reload()} className="text-sm font-medium text-signal hover:underline">
            Try again
          </button>
        }
      />
    );
  if (!data) return <PageLoader offsetSidebar />;
  return <>{children(data)}</>;
}

export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title === undefined || title === null) return;
    document.title = title ? `${title} · Shortlark` : "Shortlark";
  }, [title]);
}

export function NotFound() {
  useTitle("Not found");
  return (
    <EmptyState
      title="We couldn't find that"
      body="It may have been deleted, or the link belongs to another account."
      action={<ButtonLink href="/app">Back to videos</ButtonLink>}
    />
  );
}
