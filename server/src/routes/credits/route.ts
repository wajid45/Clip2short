import { db } from "@server/lib/db";
import { apiUser, handle, json } from "@server/lib/api";
import { creditSummary } from "@server/lib/credits";

/** Balance, breakdown by source and the latest credit movements, for the sidebar popover. */
export const GET = handle(async () => {
  const user = await apiUser();
  const [summary, recent] = await Promise.all([
    creditSummary(user.id),
    db.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, delta: true, kind: true, description: true, createdAt: true, refundedAt: true },
    }),
  ]);
  const bySource: Record<string, { remaining: number; expiresAt: string | null }> = {};
  for (const b of summary.buckets) {
    const cur = bySource[b.source];
    const exp = b.expiresAt?.toISOString() ?? null;
    bySource[b.source] = {
      remaining: (cur?.remaining ?? 0) + b.remaining,
      expiresAt: cur ? (cur.expiresAt && exp ? (cur.expiresAt < exp ? cur.expiresAt : exp) : (cur.expiresAt ?? exp)) : exp,
    };
  }
  return json({ total: summary.total, bySource, recent });
});
