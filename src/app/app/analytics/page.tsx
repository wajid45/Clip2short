import Link from "next/link";
import clsx from "clsx";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { PLATFORM_LABEL } from "@/components/badges";
import { RefreshStatsButton } from "@/components/refresh-stats-button";
import { IconExternal } from "@/components/icons";
import { LocalDateTime } from "@/components/local-time";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

const nf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmt = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireSubscriber();
  const { range: r } = await searchParams;
  const range = RANGES.some((x) => x.key === r) ? r! : "30";
  const since = new Date(Date.now() - Number(range) * 864e5);

  const posts = await db.post.findMany({
    where: { userId: user.id, status: "published", publishedAt: { gte: since } },
    include: { clip: { select: { id: true, title: true } } },
  });
  const failedCount = await db.post.count({ where: { userId: user.id, status: "failed", updatedAt: { gte: since } } });
  const scheduledCount = await db.post.count({ where: { userId: user.id, status: { in: ["queued", "scheduled"] } } });

  const sum = (k: "views" | "likes" | "comments" | "shares", list = posts) => list.reduce((a, p) => a + (p[k] ?? 0), 0);
  const totals = { posts: posts.length, views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares") };
  const engagement = totals.views ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100 : null;

  const byPlatform = [...new Set(posts.map((p) => p.platform))]
    .map((platform) => {
      const list = posts.filter((p) => p.platform === platform);
      return {
        platform,
        posts: list.length,
        views: sum("views", list),
        likes: sum("likes", list),
        comments: sum("comments", list),
        shares: sum("shares", list),
      };
    })
    .sort((a, b) => b.views - a.views);
  const maxViews = Math.max(1, ...byPlatform.map((p) => p.views));

  const top = [...posts]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 10);
  const lastUpdate = posts.reduce<Date | null>((m, p) => (p.statsUpdatedAt && (!m || p.statsUpdatedAt > m) ? p.statsUpdatedAt : m), null);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Live numbers pulled from each platform for posts published through Shortlark. Stats refresh automatically every 15 minutes."
        actions={<RefreshStatsButton />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGES.map((x) => (
          <Link
            key={x.key}
            href={`/app/analytics?range=${x.key}`}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-sm",
              range === x.key ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:text-text",
            )}
          >
            {x.label}
          </Link>
        ))}
        {lastUpdate && <span className="ml-auto text-xs text-faint">Last stats update <LocalDateTime iso={lastUpdate.toISOString()} /></span>}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Posts published" value={String(totals.posts)} />
        <Stat label="Views" value={fmt(totals.views)} />
        <Stat label="Likes" value={fmt(totals.likes)} />
        <Stat label="Comments" value={fmt(totals.comments)} />
        <Stat label="Shares" value={fmt(totals.shares)} />
        <Stat label="Engagement rate" value={engagement == null ? "—" : `${engagement.toFixed(1)}%`} hint="(likes + comments + shares) ÷ views" />
      </div>

      {(failedCount > 0 || scheduledCount > 0) && (
        <p className="mb-8 text-sm text-muted">
          {scheduledCount > 0 && (
            <>
              <span className="tc text-text">{scheduledCount}</span> in the queue.{" "}
            </>
          )}
          {failedCount > 0 && (
            <>
              <span className="tc text-danger">{failedCount}</span> failed in this period.{" "}
              <Link href="/app/queue" className="text-text underline underline-offset-4">
                Review
              </Link>
            </>
          )}
        </p>
      )}

      {posts.length === 0 ? (
        <EmptyState
          title="No published posts in this period"
          body="Post a clip to a connected account and its views, likes, comments and shares show up here."
          action={<ButtonLink href="/app/moments" variant="primary">Pick a moment to post</ButtonLink>}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="p-5">
            <h2 className="text-sm font-medium">Views by platform</h2>
            <div className="mt-5 space-y-4">
              {byPlatform.map((p) => (
                <div key={p.platform} className="group">
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-text">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                    <span className="tc text-muted">{fmt(p.views)}</span>
                  </div>
                  <div
                    className="h-2 rounded-full bg-surface-2"
                    title={`${PLATFORM_LABEL[p.platform]}: ${p.views.toLocaleString()} views · ${p.likes.toLocaleString()} likes · ${p.comments.toLocaleString()} comments · ${p.shares.toLocaleString()} shares across ${p.posts} posts`}
                  >
                    <div className="h-full rounded-full bg-signal transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(1, (p.views / maxViews) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <table className="mt-6 w-full text-sm">
              <caption className="sr-only">Per-platform totals</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Platform</th>
                  <th className="py-2 text-right font-medium">Posts</th>
                  <th className="py-2 text-right font-medium">Likes</th>
                  <th className="py-2 text-right font-medium">Comments</th>
                  <th className="py-2 text-right font-medium">Shares</th>
                </tr>
              </thead>
              <tbody className="tc">
                {byPlatform.map((p) => (
                  <tr key={p.platform} className="border-b border-line last:border-0">
                    <td className="py-2 font-sans text-text">{PLATFORM_LABEL[p.platform] ?? p.platform}</td>
                    <td className="py-2 text-right text-muted">{p.posts}</td>
                    <td className="py-2 text-right text-muted">{fmt(p.likes)}</td>
                    <td className="py-2 text-right text-muted">{fmt(p.comments)}</td>
                    <td className="py-2 text-right text-muted">{fmt(p.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-medium">Top posts</h2>
            <ol className="mt-4 divide-y divide-line">
              {top.map((p, i) => (
                <li key={p.id} className="flex items-start gap-3 py-3">
                  <span className="tc w-5 shrink-0 pt-0.5 text-xs text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/clips/${p.clip.id}`} className="block truncate text-sm text-text hover:underline">
                      {p.clip.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-faint">
                      {PLATFORM_LABEL[p.platform]} {p.accountName} · {p.publishedAt && <LocalDateTime iso={p.publishedAt.toISOString()} />}
                      {p.liveUrl && (
                        <a href={p.liveUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-muted hover:text-text">
                          Live <IconExternal size={11} />
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="tc grid shrink-0 grid-cols-3 gap-4 text-right text-xs">
                    <span><span className="block text-text">{fmt(p.views)}</span><span className="text-faint">views</span></span>
                    <span><span className="block text-text">{fmt(p.likes)}</span><span className="text-faint">likes</span></span>
                    <span><span className="block text-text">{fmt(p.comments)}</span><span className="text-faint">replies</span></span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted" title={hint}>
        {label}
      </p>
      <p className="tc mt-1.5 text-2xl font-semibold tracking-tight text-text">{value}</p>
    </Card>
  );
}
