import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { AdminLayout, AppLayout } from "./pages/app-layout";
import { AuthLayout, LoginPage, OAuthCompletePage, SignupPage } from "./pages/auth";
import { VideoPage, VideosPage } from "./pages/videos";
import { ClipPage, LibraryPage, MomentsPage } from "./pages/clips";
import { QueuePage } from "./pages/queue";
import { AnalyticsPage } from "./pages/analytics";
import { AccountsPage } from "./pages/accounts";
import { BillingPage } from "./pages/billing";
import { IntegrationsPage, LeadsPage } from "./pages/admin";
import { NotFound } from "./lib/page-data";

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app" replace /> },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
    ],
  },
  { path: "/oauth/complete", element: <OAuthCompletePage /> },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      { index: true, element: <VideosPage /> },
      { path: "videos/:id", element: <VideoPage /> },
      { path: "clips/:id", element: <ClipPage /> },
      { path: "moments", element: <MomentsPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "queue", element: <QueuePage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { path: "leads", element: <LeadsPage /> },
      { path: "integrations", element: <IntegrationsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/app" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
