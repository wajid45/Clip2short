import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@server/lib/db";
import { createSession } from "@server/lib/session";
import { handle, HttpError, json, parseBody } from "@server/lib/api";
import { rateLimit } from "@server/lib/ratelimit";

const Body = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

// Constant-time-ish path for unknown emails so response timing doesn't reveal accounts.
let dummyHash: string | null = null;
const DUMMY_HASH = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 12));

export const POST = handle(async (req: Request) => {
  await rateLimit("login", 20, 15 * 60e3);
  const { email, password } = await parseBody(req, Body);
  const user = await db.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH());
  if (!user || !ok) throw new HttpError(401, "That email and password don't match.");
  await createSession(user.id);
  return json({ ok: true });
});
