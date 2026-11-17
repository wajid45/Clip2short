import clsx from "clsx";
import Link from "next/link";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { MomentRow } from "@/components/moment-row";

export const metadata: Metadata = { title: "Best moments" };

const PAGE = 30;
const FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "85", label: "85+", min: 85 },
  { key: "70", label: "70+", min: 70 },
];

export default async function MomentsPage({ searchParams }: { searchParams: Promise<{ min?: string; page?: string; unposted?: string }> }) {
  const user = await requireSubscriber();
  const sp = await searchParams;
  const min = Number(sp.min ?? 0) || 0;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const unposted = sp.unposted === "1";
  const where = {
    userId: user.id,
    score: { not: null, ...(min ? { gte: min } : {}) },
    ...(unposted ? { status: { not: "published" } } : {}),
  };
  const [clips, total] = await Promise.all([
    db.clip.findMany({
      where,
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { video: { select: { id: true, title: true, thumbnailUrl: true } } },
    }),
    db.clip.count({ where }),
  ]);
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { min: min || undefined, unposted: unposted ? "1" : undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && v !== 0) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader title="Best moments" description="Every AI-scored moment across all your videos, best first. Start at the top and work down." />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/app/moments${qs({ min: f.min || undefined, page: undefined })}`}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-sm",
              min === f.min ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:text-text",
            )}
          >
            {f.label}
          </Link>
        ))}
        <Link
          href={`/app/moments${qs({ unposted: unposted ? undefined : "1", page: undefined })}`}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-sm",
            unposted ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:text-text",
          )}
        >
          Not yet published
        </Link>
        <span className="tc ml-auto text-sm text-faint">{total} moments</span>
      </div>

      {clips.length === 0 ? (
        <EmptyState
          title="No scored moments yet"
          body="Import a video and the AI will rank its moments here."
          action={<ButtonLink href="/app" variant="primary">Import a video</ButtonLink>}
        />
      ) : (
        <div className="-mx-3 sm:-mx-4">
          {clips.map((c, i) => (
            <MomentRow key={c.id} clip={c} rank={(page - 1) * PAGE + i + 1} showVideo />
          ))}
        </div>
      )}

      {total > PAGE && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && <ButtonLink href={`/app/moments${qs({ page: page - 1 })}`}>Previous</ButtonLink>}
          <span className="tc px-3 text-sm text-muted">
            {page} / {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total && <ButtonLink href={`/app/moments${qs({ page: page + 1 })}`}>Next</ButtonLink>}
        </div>
      )}
    </>
  );
}
