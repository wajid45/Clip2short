/**
 * Where the marketing site lives (Terms, Privacy, Contact, the logo on sign-in pages).
 * Set VITE_LANDING_URL at build time; development defaults to the local landing server.
 */
export const LANDING_URL = (import.meta.env.VITE_LANDING_URL || (import.meta.env.DEV ? "http://localhost:3001" : "https://shortlark.com")).replace(/\/$/, "");

export const landingHref = (path: string) => `${LANDING_URL}${path}`;
