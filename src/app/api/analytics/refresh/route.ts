import { apiUser, handle, json } from "@/lib/api";
import { refreshStats } from "@/lib/social/publisher";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 120;

export const POST = handle(async () => {
  const user = await apiUser();
  await rateLimit(`stats:${user.id}`, 6, 10 * 60e3);
  const n = await refreshStats({ userId: user.id, limit: 100 });
  return json({ refreshed: n });
});
