/**
 * Pricing. Shared by the landing page, billing page and server-side checks.
 *
 * Users pay for the video they process, in credits:
 *   1 credit = 1 minute of source video analysed by the AI (rounded up, minimum 1).
 * Credits come from a free trial, a monthly plan (credits reset each billing period),
 * or one-off packs (never expire). Posting never costs credits.
 *
 * The numbers live in pricing.json, which the Python API reads too.
 */

import pricing from "./pricing.json";

export type PlanId = "creator" | "pro" | "studio";

export interface Limits {
  maxVideoMinutes: number | null; // null: any length
  socialAccounts: number;
  scheduledPosts: number; // queued + scheduled at once
  captions: boolean; // AI hooks and captions per network
  posting: boolean; // posting to social accounts now
  scheduling: boolean; // scheduling posts for later
  postAnalytics: boolean; // views, likes and engagement per post
  networks: string[]; // social networks the plan can connect
  engines: string[]; // category engines (video kinds) the plan can analyse
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // USD per month
  monthlyCredits: number;
  tagline: string;
  limits: Limits;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = pricing.plans as Plan[];

export interface CreditPack {
  id: "pack-100" | "pack-500" | "pack-2000";
  credits: number;
  price: number; // USD, one-off
}

export const CREDIT_PACKS: CreditPack[] = pricing.creditPacks as CreditPack[];

export const TRIAL: { credits: number; days: number } = pricing.trial;

/** Limits for people without a plan (trial or packs only). */
export const BASE_LIMITS: Limits = pricing.baseLimits;

export function getPlan(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

/** "Podcast and gaming engines", "All five category engines", ... */
export function enginesText(engines: string[]): string {
  if (engines.length >= 5) return "All five category engines";
  const names = engines.map((e) => (e === "other" ? "other" : e === "movies" ? "film" : e));
  const list = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} engines`;
}

/** The smallest plan that includes an engine. */
export function planWithEngine(id: string): Plan | null {
  return PLANS.find((p) => p.limits.engines.includes(id)) ?? null;
}

export function getPack(id: string | null | undefined): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}

export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function hasActiveSubscription(u: { plan: string; subscriptionStatus: string }): boolean {
  return ACTIVE_STATUSES.has(u.subscriptionStatus) && getPlan(u.plan) !== null;
}

export function limitsFor(u: { plan: string; subscriptionStatus: string }): Limits {
  return hasActiveSubscription(u) ? getPlan(u.plan)!.limits : BASE_LIMITS;
}

/** Credits to analyse a video: 1 per minute, rounded up. Re-runs cost a quarter. */
export function analysisCost(durationSec: number, rerun: boolean): number {
  const minutes = Math.max(1, Math.ceil(durationSec / 60));
  return rerun ? Math.max(1, Math.ceil(minutes / 4)) : minutes;
}
