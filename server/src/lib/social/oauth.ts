import { env } from "../env";

/** Where to land after a sign-in flow: the popup closer page, or the accounts page for full-page flows. */
export function finishUrl(popup: boolean, ok: boolean, message: string) {
  const q = `${ok ? "connected" : "error"}=${encodeURIComponent(message)}`;
  return popup ? `${env.appUrl}/oauth/complete?${q}` : `${env.appUrl}/app/accounts?${q}`;
}
