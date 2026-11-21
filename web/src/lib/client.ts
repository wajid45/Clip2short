/**
 * API origin. Empty in development and on a same-origin deploy (a host that proxies `/api` to the
 * backend), so calls stay relative. Set VITE_API_URL at build time when the API lives on its own
 * origin (e.g. a static app on app.clip2short.com talking to api.clip2short.com).
 */
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** Prefix an `/api` path with the API origin when one is configured; otherwise leave it relative. */
export const apiUrl = (path: string) => (API_BASE && path.startsWith("/api") ? API_BASE + path : path);

/** An API error with the server's message, HTTP status and machine-readable code (when the server sends one). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Browser-side JSON fetch that surfaces the server's error message. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(apiUrl(url), {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "include", // send the session cookie even when the API is on another origin
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  if (!res.ok) {
    const body = data as { error?: string; code?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  }
  return data as T;
}
