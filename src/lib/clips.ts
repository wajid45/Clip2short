import "server-only";
import type { Prisma } from "@prisma/client";

export const CLIP_STATUSES = ["idea", "draft", "ready", "published"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export interface ClipFilters {
  q?: string;
  status?: string;
  source?: string; // youtube | vimeo | direct
  category?: string;
  minScore?: number;
  videoId?: string;
  sort?: string; // score | newest | oldest | duration | title
}

export function filtersFromParams(sp: URLSearchParams | Record<string, string | string[] | undefined>): ClipFilters {
  const get = (k: string) => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const min = Number(get("minScore"));
  return {
    q: get("q")?.trim() || undefined,
    status: get("status") || undefined,
    source: get("source") || undefined,
    category: get("category") || undefined,
    minScore: Number.isFinite(min) && min > 0 ? min : undefined,
    videoId: get("videoId") || undefined,
    sort: get("sort") || undefined,
  };
}

export function clipWhere(userId: string, f: ClipFilters): Prisma.ClipWhereInput {
  const where: Prisma.ClipWhereInput = { userId };
  if (f.status && (CLIP_STATUSES as readonly string[]).includes(f.status)) where.status = f.status;
  if (f.category) where.category = f.category;
  if (f.minScore) where.score = { gte: f.minScore };
  if (f.videoId) where.videoId = f.videoId;
  if (f.source) where.video = { platform: f.source };
  if (f.q) {
    where.OR = [
      { title: { contains: f.q } },
      { hook: { contains: f.q } },
      { caption: { contains: f.q } },
      { notes: { contains: f.q } },
      { transcript: { contains: f.q } },
      { video: { title: { contains: f.q } } },
    ];
  }
  return where;
}

export function clipOrder(sort?: string): Prisma.ClipOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "title":
      return [{ title: "asc" }];
    case "start":
      return [{ videoId: "asc" }, { startSec: "asc" }];
    default:
      return [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  }
}
