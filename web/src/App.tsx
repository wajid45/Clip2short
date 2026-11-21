import type { ReactElement } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";
import { AppLayout } from "./pages/app-layout";
import { AuthLayout, LoginPage, OAuthCompletePage, SignupPage } from "./pages/auth";
import { VideoPage, VideosPage } from "./pages/videos";
import { ClipPage, LibraryPage, MomentsPage } from "./pages/clips";
import { QueuePage } from "./pages/queue";
import { AnalyticsPage } from "./pages/analytics";
import { AccountsPage } from "./pages/accounts";
import { BillingPage } from "./pages/billing";
import { OverviewPage } from "./pages/overview";
import { ForgotPasswordPage, HelpPage, ResetPasswordPage, SettingsPage } from "./pages/account";
import { NotFound } from "./lib/page-data";
import { PAGE_TOKENS, toPublic } from "./lib/routes";

/** Sends a readable address (/app/billing?x) to its token form, keeping the query and hash. */
function ToTokenPath() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${toPublic(pathname)}${search}${hash}`} replace />;
}

function pages(list: [string, ReactElement][]) {
  return list.flatMap(([path, element]) => {
    const [name, ...rest] = path.split("/");
    const tail = rest.length ? `/${rest.join("/")}` : "";
    return [
      { path: `${PAGE_TOKENS[name]}${tail}`, element },
      { path, element: <ToTokenPath /> },
    ];
  });
}

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app" replace /> },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  { path: "/oauth/complete", element: <OAuthCompletePage /> },
  // Reset works whether or not someone is signed in on this browser.
  { element: <AuthLayout allowSignedIn />, children: [{ path: "/reset-password", element: <ResetPasswordPage /> }] },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      { index: true, element: <VideosPage /> },
      // Each page is served at its opaque token; the readable name redirects to it.
      ...pages([
        ["overview", <OverviewPage />],
        ["videos/:id", <VideoPage />],
        ["clips/:id", <ClipPage />],
        ["moments", <MomentsPage />],
        ["library", <LibraryPage />],
        ["queue", <QueuePage />],
        ["analytics", <AnalyticsPage />],
        ["accounts", <AccountsPage />],
        ["billing", <BillingPage />],
        ["settings", <SettingsPage />],
        ["help", <HelpPage />],
      ]),
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "*", element: <Navigate to="/app" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
