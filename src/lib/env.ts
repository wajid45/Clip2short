import "server-only";

/**
 * Central, typed access to environment configuration.
 * Optional integrations (Stripe, social networks, Anthropic) report whether they
 * are configured so the UI can explain what is missing instead of failing late.
 */

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  appUrl: (opt("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  isProd: process.env.NODE_ENV === "production",
  sessionSecret: opt("SESSION_SECRET"),
  encryptionKey: opt("ENCRYPTION_KEY"),
  cronSecret: opt("CRON_SECRET"),
  adminEmails: (opt("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  anthropicKey: opt("ANTHROPIC_API_KEY"),
  anthropicModel: opt("ANTHROPIC_MODEL") ?? "claude-opus-5-5",

  stripeSecret: opt("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: opt("STRIPE_WEBHOOK_SECRET"),
  stripePrices: {
    creator: opt("STRIPE_PRICE_CREATOR"),
    pro: opt("STRIPE_PRICE_PRO"),
    studio: opt("STRIPE_PRICE_STUDIO"),
  },

  meta: { appId: opt("META_APP_ID"), appSecret: opt("META_APP_SECRET") },

  /** Sandbox social accounts simulate publishing; never on in production unless explicitly enabled. */
  socialSandbox:
    opt("SOCIAL_SANDBOX") === "true" || (process.env.NODE_ENV !== "production" && opt("SOCIAL_SANDBOX") !== "false"),
  /** Runs the 15-minute publisher inside the Node server (for hosts without an external cron). */
  internalScheduler: opt("INTERNAL_SCHEDULER") === "true",
};

export const billingConfigured = () =>
  Boolean(env.stripeSecret && env.stripePrices.creator && env.stripePrices.pro && env.stripePrices.studio);

/** In local development without Stripe keys, plans can be activated directly for testing. */
export const devBillingBypass = () => !env.isProd && !billingConfigured();

export function requireSecret(name: "sessionSecret" | "encryptionKey"): string {
  const v = env[name];
  if (v) return v;
  if (env.isProd) throw new Error(`Missing required environment variable for ${name}`);
  // Deterministic development fallback so local sessions survive restarts. Never used in production.
  return `dev-only-${name}-change-me-in-production-0123456789abcdef`;
}
