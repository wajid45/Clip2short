import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { clipOrder, clipWhere, filtersFromParams } from "@/lib/clips";
import { PageHeader } from "@/components/ui";
import { LibraryTable } from "@/components/library-table";

export const metadata: Metadata = { title: "Clip library" };

const LIMIT = 500;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSubscriber();
  const filters = filtersFromParams(await searchParams);
  const where = clipWhere(user.id, filters);
  const [clips, total] = await Promise.all([
    db.clip.findMany({
      where,
      orderBy: clipOrder(filters.sort),
      take: LIMIT,
      include: { video: { select: { title: true, platform: true } }, _count: { select: { posts: { where: { status: "published" } } } } },
    }),
    db.clip.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="Clip library" description="Every clip across your videos. Filter, select and update in bulk, or export for your editor." />
      <Suspense>
        <LibraryTable
          total={total}
          rows={clips.map((c) => ({
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
          }))}
        />
      </Suspense>
      {total > LIMIT && <p className="mt-3 text-sm text-faint">Showing the first {LIMIT}. Narrow the filters or export to see all {total}.</p>}
    </>
  );
}
