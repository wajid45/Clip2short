import { requireSubscriber } from "@server/lib/auth";
import { db } from "@server/lib/db";
import { clipOrder, clipWhere, filtersFromParams } from "@server/lib/clips";

const MOMENTS_PAGE = 30;
const LIBRARY_LIMIT = 500;

export async function loadMoments(q: URLSearchParams) {
  const user = await requireSubscriber();
  const min = Number(q.get("min") ?? 0) || 0;
  const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const unposted = q.get("unposted") === "1";
  const where = {
    userId: user.id,
    score: { not: null, ...(min ? { gte: min } : {}) },
    ...(unposted ? { status: { not: "published" } } : {}),
  };
  const [clips, total] = await Promise.all([
    db.clip.findMany({
      where,
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * MOMENTS_PAGE,
      take: MOMENTS_PAGE,
      include: { video: { select: { id: true, title: true, thumbnailUrl: true } } },
    }),
    db.clip.count({ where }),
  ]);
  return { clips, total, page, min, unposted, pageSize: MOMENTS_PAGE };
}

export async function loadLibrary(q: URLSearchParams) {
  const user = await requireSubscriber();
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(q.keys())) {
    const all = q.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  const filters = filtersFromParams(params);
  const where = clipWhere(user.id, filters);
  const [clips, total] = await Promise.all([
    db.clip.findMany({
      where,
      orderBy: clipOrder(filters.sort),
      take: LIBRARY_LIMIT,
      include: { video: { select: { title: true, platform: true } }, _count: { select: { posts: { where: { status: "published" } } } } },
    }),
    db.clip.count({ where }),
  ]);
  return {
    total,
    limit: LIBRARY_LIMIT,
    rows: clips.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      score: c.score,
      category: c.category,
      startSec: c.startSec,
      endSec: c.endSec,
      videoTitle: c.video.title,
      source: c.video.platform,
      updatedAt: c.updatedAt.toISOString(),
      posts: c._count.posts,
    })),
  };
}

export async function loadQueue(q: URLSearchParams) {
  const user = await requireSubscriber();
  const history = q.get("view") === "history";
  const posts = await db.post.findMany({
    where: history
      ? { userId: user.id, status: { in: ["published", "canceled"] } }
      : { userId: user.id, status: { in: ["queued", "scheduled", "publishing", "failed"] } },
    orderBy: history ? [{ publishedAt: "desc" }, { updatedAt: "desc" }] : [{ scheduledAt: { sort: "asc", nulls: "first" } }],
    take: history ? 200 : 500,
    select: {
      id: true,
      platform: true,
      accountName: true,
      status: true,
      text: true,
      error: true,
      liveUrl: true,
      scheduledAt: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      clip: { select: { id: true, title: true, video: { select: { title: true } } } },
    },
  });
  return { history, posts };
}

const RANGES = ["7", "30", "90"];

export async function loadAnalytics(q: URLSearchParams) {
  const user = await requireSubscriber();
  const r = q.get("range") ?? "";
  const range = RANGES.includes(r) ? r : "30";
  const since = new Date(Date.now() - Number(range) * 864e5);

  const [posts, failedCount, scheduledCount] = await Promise.all([
    db.post.findMany({
      where: { userId: user.id, status: "published", publishedAt: { gte: since } },
      include: { clip: { select: { id: true, title: true } } },
    }),
    db.post.count({ where: { userId: user.id, status: "failed", updatedAt: { gte: since } } }),
    db.post.count({ where: { userId: user.id, status: { in: ["queued", "scheduled"] } } }),
  ]);

  const sum = (k: "views" | "likes" | "comments" | "shares", list = posts) => list.reduce((a, p) => a + (p[k] ?? 0), 0);
  const totals = { posts: posts.length, views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares") };
  const engagement = totals.views ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100 : null;
  const byPlatform = [...new Set(posts.map((p) => p.platform))]
    .map((platform) => {
      const list = posts.filter((p) => p.platform === platform);
      return { platform, posts: list.length, views: sum("views", list), likes: sum("likes", list), comments: sum("comments", list), shares: sum("shares", list) };
    })
    .sort((a, b) => b.views - a.views);
  const top = [...posts]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      platform: p.platform,
      accountName: p.accountName,
      publishedAt: p.publishedAt,
      liveUrl: p.liveUrl,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      clip: p.clip,
    }));
  const lastUpdate = posts.reduce<Date | null>((m, p) => (p.statsUpdatedAt && (!m || p.statsUpdatedAt > m) ? p.statsUpdatedAt : m), null);
  return { range, totals, engagement, byPlatform, top, lastUpdate, failedCount, scheduledCount };
}
