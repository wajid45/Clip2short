import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { handle, HttpError, json, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { ensureTrial } from "@/lib/credits";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const POST = handle(async (req: Request) => {
  await rateLimit("signup", 10, 60 * 60e3);
  const { name, email, password } = await parseBody(req, Body);
  if (await db.user.findUnique({ where: { email } }))
    throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  const user = await db.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) } });
  // Convert a landing-page lead into a customer record.
  await db.lead.updateMany({ where: { email }, data: { source: "converted" } }).catch(() => {});
  await ensureTrial(user.id);
  await createSession(user.id);
  return json({ ok: true });
});
