import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runPublisher } from "@/lib/social/publisher";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request) {
  if (!env.cronSecret) return !env.isProd; // open locally, locked in production until CRON_SECRET is set
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called every 15 minutes (vercel.json cron, or any external scheduler). */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const result = await runPublisher();
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}
