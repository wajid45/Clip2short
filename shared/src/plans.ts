/**
 * Pricing. Shared by the landing page, billing page and server-side checks.
 *
 * Users pay for the video they process, in credits:
 *   1 credit = 1 minute of source video analysed by the AI (rounded up, minimum 1).
 * Credits come from a free trial, a monthly plan (credits reset each billing period),
 * or one-off packs (never expire). Posting and scheduling never cost credits.
 */

export type PlanId = "creator" | "pro" | "studio";

export interface Limits {
  maxVideoMinutes: number;
  socialAccounts: number;
  scheduledPosts: number; // queued + scheduled at once
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

export const PLANS: Plan[] = [
  {
    id: "creator",
    name: "Creator",
    price: 19,
    monthlyCredits: 300,
    tagline: "For a weekly stream or podcast.",
    limits: { maxVideoMinutes: 180, socialAccounts: 3, scheduledPosts: 30 },
    features: ["300 credits every month (5 hours of video)", "Videos up to 3 hours", "3 connected social accounts", "30 posts in the queue"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    monthlyCredits: 1000,
    tagline: "For daily streamers and busy clippers.",
    highlight: true,
    limits: { maxVideoMinutes: 360, socialAccounts: 10, scheduledPosts: 300 },
    features: ["1,000 credits every month (16+ hours)", "Videos up to 6 hours", "10 connected social accounts", "300 posts in the queue"],
  },
  {
    id: "studio",
    name: "Studio",
    price: 129,
    monthlyCredits: 3000,
    tagline: "For agencies running many channels.",
    limits: { maxVideoMinutes: 600, socialAccounts: 40, scheduledPosts: 2000 },
    features: ["3,000 credits every month (50 hours)", "Videos up to 10 hours", "40 connected social accounts", "2,000 posts in the queue"],
  },
];

export interface CreditPack {
  id: "pack-100" | "pack-500" | "pack-2000";
  credits: number;
  price: number; // USD, one-off
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-100", credits: 100, price: 9 },
  { id: "pack-500", credits: 500, price: 39 },
  { id: "pack-2000", credits: 2000, price: 129 },
];

export const TRIAL = { credits: 60, days: 14 };

/** Limits for people without a plan (trial or packs only). */
export const BASE_LIMITS: Limits = { maxVideoMinutes: 120, socialAccounts: 2, scheduledPosts: 15 };

export function getPlan(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
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
