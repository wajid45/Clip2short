import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateHost } from "./source";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** fetch with timeout and browser-like headers. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, headers, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9", ...headers },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves the host and refuses private addresses (for user-supplied direct links). */
export async function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  if (isPrivateHost(u.hostname)) throw new Error("Private network addresses are not allowed.");
  if (isIP(u.hostname)) return;
  const addrs = await lookup(u.hostname, { all: true });
  if (addrs.some((a) => isPrivateHost(a.address))) throw new Error("That host resolves to a private network address.");
}
