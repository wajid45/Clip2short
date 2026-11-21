import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./styles.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/toast";
import { AdminShell } from "./components/shell";
import { Spinner } from "./components/ui";
import { LoginPage } from "./pages/login";
import { OverviewPage } from "./pages/overview";
import { UsersPage } from "./pages/users";
import { UserPage } from "./pages/user";
import { SecurityPage } from "./pages/security";
import { MessagesPage } from "./pages/messages";
import { PaymentsPage } from "./pages/payments";
import { IntegrationsPage } from "./pages/integrations";
import { LeadsPage } from "./pages/leads";

function Protected({ children }: { children: ReactNode }) {
  const { me, ready } = useAuth();
  const { pathname, search } = useLocation();
  if (!ready) return <Spinner />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <AdminShell>{children}</AdminShell>;
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-display text-[28px] text-text">Nothing here</p>
      <a href="/" className="mt-3 inline-block text-sm text-signal hover:underline">
        Back to the overview
      </a>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Protected><OverviewPage /></Protected>} />
          <Route path="/users" element={<Protected><UsersPage /></Protected>} />
          <Route path="/users/:id" element={<Protected><UserPage /></Protected>} />
          <Route path="/payments" element={<Protected><PaymentsPage /></Protected>} />
          <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
          <Route path="/leads" element={<Protected><LeadsPage /></Protected>} />
          <Route path="/integrations" element={<Protected><IntegrationsPage /></Protected>} />
          <Route path="/security" element={<Protected><SecurityPage /></Protected>} />
          <Route path="*" element={<Protected><NotFound /></Protected>} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
