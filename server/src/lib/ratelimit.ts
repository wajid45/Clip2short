import { getHeader, getRequestIp } from "../http/context";
import { HttpError } from "./api";

/**
 * Small fixed-window limiter for abuse-prone public endpoints (login, signup, leads).
 * In-memory, so per instance; put a shared store (Redis/Upstash) in front for multi-instance deployments.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export async function clientIp(): Promise<string> {
  // Express resolves the client address (honouring X-Forwarded-For only when TRUST_PROXY is set).
  return getRequestIp() ?? getHeader("x-real-ip") ?? "unknown";
}

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const id = `${key}:${await clientIp()}`;
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.reset < now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  if (++b.count > limit) throw new HttpError(429, "Too many attempts. Please wait a moment and try again.");
}
