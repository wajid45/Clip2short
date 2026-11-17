import "server-only";
import { db } from "./db";
import { decrypt } from "./crypto";

/**
 * Developer-app credentials for each social network.
 *
 * Like Buffer or Hootsuite, Shortlark registers ONE developer app per network; every
 * customer then just clicks "Connect" and signs in with their own account. An admin
 * enters these credentials once in Admin → Integrations (stored encrypted), or sets
 * them as environment variables. Values saved in the app take precedence.
 */

export type IntegrationId = "meta" | "google";

export interface IntegrationInfo {
  id: IntegrationId;
  name: string;
  platforms: string[]; // social platforms this app powers
  consoleUrl: string;
  idLabel: string;
  secretLabel: string;
  env: [string, string];
  secretOptional?: boolean;
  steps: string[];
}

export const INTEGRATIONS: IntegrationInfo[] = [
  {
    id: "google",
    name: "Google (YouTube)",
    platforms: ["youtube"],
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    idLabel: "OAuth client ID",
    secretLabel: "OAuth client secret",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    steps: [
      "Create a Google Cloud project and enable the YouTube Data API v3.",
      "Configure the OAuth consent screen (External) and add the scope …/auth/youtube.",
      "Create an OAuth client of type “Web application” and add the redirect URI below.",
      "Submit the app for verification and the YouTube API audit. Until then, uploads are forced to private.",
    ],
  },
  {
    id: "meta",
    name: "Meta (Facebook + Instagram)",
    platforms: ["facebook", "instagram"],
    consoleUrl: "https://developers.facebook.com/apps",
    idLabel: "App ID",
    secretLabel: "App secret",
    env: ["META_APP_ID", "META_APP_SECRET"],
    steps: [
      "Create a Business app and add the Facebook Login product.",
      "Add both redirect URIs below to Facebook Login → Valid OAuth Redirect URIs.",
      "Request pages_manage_posts, pages_read_engagement, instagram_content_publish and instagram_manage_insights in App Review.",
    ],
  },
];

export function integrationFor(platform: string): IntegrationInfo | undefined {
  return INTEGRATIONS.find((i) => i.platforms.includes(platform));
}

interface Cred {
  id?: string;
  secret?: string;
  source: "app" | "env" | "none";
}

let cache: Partial<Record<IntegrationId, { id: string; secret?: string }>> = {};
let loadedAt = 0;

/** Loads admin-entered credentials (cached briefly). Call at the start of any request that uses a provider. */
export async function loadIntegrations(force = false) {
  if (!force && Date.now() - loadedAt < 30_000) return;
  try {
    const rows = await db.integrationSetting.findMany();
    const next: typeof cache = {};
    for (const r of rows) {
      let secret: string | undefined;
      try {
        secret = r.clientSecretEnc ? decrypt(r.clientSecretEnc) : undefined;
      } catch {
        secret = undefined; // encryption key changed; treat as unset
      }
      next[r.id as IntegrationId] = { id: r.clientId, secret };
    }
    cache = next;
    loadedAt = Date.now();
  } catch (e) {
    console.error("[integrations] load failed", e);
  }
}

function envOf(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function cred(id: IntegrationId): Cred {
  const saved = cache[id];
  if (saved?.id) return { id: saved.id, secret: saved.secret, source: "app" };
  const info = INTEGRATIONS.find((i) => i.id === id)!;
  const eid = envOf(info.env[0]);
  if (eid) return { id: eid, secret: envOf(info.env[1]), source: "env" };
  return { source: "none" };
}

export function isConfigured(id: IntegrationId): boolean {
  const c = cred(id);
  const info = INTEGRATIONS.find((i) => i.id === id)!;
  return Boolean(c.id && (c.secret || info.secretOptional));
}
