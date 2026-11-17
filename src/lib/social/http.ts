import "server-only";
import { PublishError } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** JSON request helper that turns platform error payloads into readable PublishErrors. */
export async function api<T = any>(url: string, init: RequestInit & { form?: Record<string, string> } = {}): Promise<T> {
  const { form, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : rest.body,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok || data?.error?.code && data?.error?.code !== "ok") {
    const msg =
      data?.error?.error_user_msg ||
      data?.error?.message ||
      data?.error_description ||
      data?.detail ||
      data?.title ||
      (typeof data?.error === "string" ? data.error : null) ||
      data?.errors?.[0]?.message ||
      data?.raw ||
      `HTTP ${res.status}`;
    throw new PublishError(String(msg), res.status === 429 || res.status >= 500);
  }
  return data as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
