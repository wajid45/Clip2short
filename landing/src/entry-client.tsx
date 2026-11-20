import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);

// Production pages arrive pre-rendered; hydrate them. The dev server renders on the client
// (its root only holds the <!--app-html--> placeholder comment, which is not markup to hydrate).
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);

// Privacy-friendly analytics (Plausible: no cookies, no personal data). Off unless
// VITE_PLAUSIBLE_DOMAIN is set at build time. Clicks into sign-up are counted as a goal.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
if (plausibleDomain) {
  const s = document.createElement("script");
  s.defer = true;
  s.dataset.domain = plausibleDomain;
  s.src = "https://plausible.io/js/script.js";
  document.head.appendChild(s);
  const w = window as Window & { plausible?: (event: string, opts?: { props?: Record<string, string> }) => void };
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href*='/signup']");
    if (a) w.plausible?.("Sign-up click", { props: { page: location.pathname } });
  });
}
