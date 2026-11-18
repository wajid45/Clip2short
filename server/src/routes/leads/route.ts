import { z } from "zod";
import { db } from "@server/lib/db";
import { handle, json, parseBody } from "@server/lib/api";
import { rateLimit } from "@server/lib/ratelimit";

const Body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  source: z.string().max(40).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  referrer: z.string().max(500).optional(),
  website: z.string().optional(), // honeypot: real people never fill this
});

export const POST = handle(async (req: Request) => {
  await rateLimit("leads", 8, 10 * 60e3);
  const body = await parseBody(req, Body);
  if (body.website) return json({ ok: true }); // silently drop bots
  const data = {
    utmSource: body.utmSource || undefined,
    utmMedium: body.utmMedium || undefined,
    utmCampaign: body.utmCampaign || undefined,
    referrer: body.referrer || undefined,
    userAgent: req.headers.get("user-agent")?.slice(0, 300),
  };
  await db.lead.upsert({
    where: { email: body.email },
    create: { email: body.email, source: body.source ?? "landing-hero", ...data },
    update: { signups: { increment: 1 } },
  });
  return json({ ok: true });
});
