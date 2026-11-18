import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";

/**
 * Per-request context, so library code can read cookies/headers and set cookies
 * without threading `req`/`res` through every call (the role `next/headers` played before).
 */
export interface RequestContext {
  req: Request;
  setCookies: string[];
  cache: Map<string, unknown>;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

function current(): RequestContext {
  const c = als.getStore();
  if (!c) throw new Error("No request context: this function must run inside an API request.");
  return c;
}

export function getHeader(name: string): string | null {
  const v = current().req.headers[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function getCookie(name: string): string | undefined {
  const raw = current().req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return undefined;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
}

export function setCookie(name: string, value: string, opts: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`];
  if (opts.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    parts.push(`Expires=${new Date(Date.now() + opts.maxAge * 1000).toUTCString()}`);
  }
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`);
  current().setCookies.push(parts.join("; "));
}

export function deleteCookie(name: string, path = "/") {
  current().setCookies.push(`${name}=; Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function getRequestIp(): string | null {
  return als.getStore()?.req.ip ?? null;
}

/** Memoises a value for the rest of this request (e.g. the signed-in user). */
export async function requestCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const store = als.getStore();
  if (!store) return fn();
  if (!store.cache.has(key)) store.cache.set(key, fn());
  return store.cache.get(key) as Promise<T>;
}
