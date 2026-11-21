import { Outlet } from "react-router";
import type { MeData } from "@shortlark/shared/api-types";
import { AppShell } from "@/components/app-nav";
import { PageLoader } from "@/components/page-loader";
import { usePageData } from "@/lib/page-data";
import { Navigate } from "react-router";

/** Signed-in workspace: sidebar + the current screen. Signed-out visitors are sent to sign in. */
export function AppLayout() {
  const { state } = usePageData<MeData>("/me");
  if (state.status === "redirect") return <Navigate to={state.to} replace />;
  if (!state.data) {
    if (state.status === "error")
      return (
        <div className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-muted">
          Couldn&apos;t reach Clip2Short. Check your connection and reload the page.
        </div>
      );
    return <PageLoader />;
  }
  return (
    <AppShell user={state.data}>
      <Outlet />
    </AppShell>
  );
}

/** Admin screens use their own full-width frame (no workspace sidebar). */
