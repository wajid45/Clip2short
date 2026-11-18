/** Where the web app and API live. Set at build time; defaults match local development. */
export const APP_URL = (import.meta.env.VITE_APP_URL || "http://localhost:3000").replace(/\/$/, "");
/** API origin for the lead form. Empty = same origin (the dev server proxies /api). */
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** Absolute link into the web app (sign up, sign in, billing). */
export const appHref = (path: string) => `${APP_URL}${path}`;
