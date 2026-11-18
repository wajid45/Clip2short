import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { NextFunction, Request as ExRequest, RequestHandler, Response as ExResponse } from "express";
import { runWithContext, type RequestContext } from "./context";

export type RouteContext<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };
// Handlers are written against the web-standard Request/Response, so they stay portable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebHandler = (req: Request, ctx: RouteContext<any>) => Promise<Response> | Response;

function toWebRequest(req: ExRequest, signal: AbortSignal): Request {
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && Buffer.isBuffer(req.body) && req.body.length > 0;
  const body = hasBody ? new Uint8Array(req.body as Buffer) : undefined;
  return new Request(url, { method: req.method, headers, body, signal });
}

async function sendWebResponse(out: Response, res: ExResponse, ctx: RequestContext) {
  res.status(out.status);
  out.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
  });
  const cookies = [...out.headers.getSetCookie(), ...ctx.setCookies];
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  if (!out.body) {
    res.end();
    return;
  }
  const stream = Readable.fromWeb(out.body as unknown as NodeReadableStream);
  stream.on("error", (e) => {
    console.error("[api] response stream failed", e);
    res.destroy(e);
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

/** Mounts a web-standard route handler on Express, inside a request context. */
export function route(handler: WebHandler): RequestHandler {
  return async (req: ExRequest, res: ExResponse, next: NextFunction) => {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });
    const ctx: RequestContext = { req, setCookies: [], cache: new Map() };
    try {
      const out = await runWithContext(ctx, () =>
        handler(toWebRequest(req, abort.signal), { params: Promise.resolve({ ...(req.params as Record<string, string>) }) }),
      );
      await sendWebResponse(out, res, ctx);
    } catch (e) {
      next(e);
    }
  };
}
