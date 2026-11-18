import { apiUser, handle, json } from "@server/lib/api";
import { refreshStats } from "@server/lib/social/publisher";
import { rateLimit } from "@server/lib/ratelimit";


export const POST = handle(async () => {
  const user = await apiUser();
  await rateLimit(`stats:${user.id}`, 6, 10 * 60e3);
  const n = await refreshStats({ userId: user.id, limit: 100 });
  return json({ refreshed: n });
});
