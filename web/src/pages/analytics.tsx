import clsx from "clsx";
import type { AnalyticsData } from "@shortlark/shared/api-types";
import { IconExternal } from "@shortlark/shared/components/icons";
import { Link, useSearchParams } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { PLATFORM_LABEL } from "@/components/badges";
import { RefreshStatsButton } from "@/components/refresh-stats-button";
import { LocalDateTime } from "@/components/local-time";

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

const nf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmt = (n: number | null | undefined) => (n == null ? "·" : nf.format(n));

export function AnalyticsPage() {
  const range = useSearchParams().get("range");
  return (
    <PageData<AnalyticsData> path={`/analytics${range ? `?range=${encodeURIComponent(range)}` : ""}`} title="Analytics">
      {(d) => {
        const maxViews = Math.max(1, ...d.byPlatform.map((p) => p.views));
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
                  scroll={false}
                  className={clsx(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    d.range === x.key ? "border-signal bg-signal-soft text-text" : "border-line text-muted hover:text-text",
                  )}
                >
                  {x.label}
                </Link>
              ))}
              {d.lastUpdate && (
                <span className="ml-auto text-xs text-faint">
                  Last stats update <LocalDateTime iso={d.lastUpdate} />
                </span>
              )}
            </div>

            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Posts published" value={String(d.totals.posts)} />
              <Stat label="Views" value={fmt(d.totals.views)} />
              <Stat label="Likes" value={fmt(d.totals.likes)} />
              <Stat label="Comments" value={fmt(d.totals.comments)} />
              <Stat label="Shares" value={fmt(d.totals.shares)} />
              <Stat label="Engagement rate" value={d.engagement == null ? "·" : `${d.engagement.toFixed(1)}%`} hint="(likes + comments + shares) ÷ views" />
            </div>

            {(d.failedCount > 0 || d.scheduledCount > 0) && (
              <p className="mb-8 text-sm text-muted">
                {d.scheduledCount > 0 && (
                  <>
                    <span className="tc text-text">{d.scheduledCount}</span> in the queue.{" "}
                  </>
                )}
                {d.failedCount > 0 && (
                  <>
                    <span className="tc text-danger">{d.failedCount}</span> failed in this period.{" "}
                    <Link href="/app/queue" className="text-text underline underline-offset-4">
                      Review
                    </Link>
                  </>
                )}
              </p>
            )}

            {d.totals.posts === 0 ? (
              <EmptyState
                title="No published posts in this period"
                body="Post a clip to a connected account and its views, likes, comments and shares show up here."
                action={
                  <ButtonLink href="/app/moments" variant="primary">
                    Pick a moment to post
                  </ButtonLink>
                }
              />
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <Card className="p-5">
                  <h2 className="text-sm font-medium">Views by platform</h2>
                  <div className="mt-5 space-y-4">
                    {d.byPlatform.map((p) => (
                      <div key={p.platform} className="group">
                        <div className="mb-1.5 flex items-baseline justify-between text-sm">
                          <span className="text-text">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                          <span className="tc text-muted">{fmt(p.views)}</span>
                        </div>
                        <div
                          className="h-2 rounded-full bg-surface-2"
                          title={`${PLATFORM_LABEL[p.platform]}: ${p.views.toLocaleString()} views · ${p.likes.toLocaleString()} likes · ${p.comments.toLocaleString()} comments · ${p.shares.toLocaleString()} shares across ${p.posts} posts`}
                        >
                          <div
                            className="h-full rounded-full bg-signal transition-opacity group-hover:opacity-80"
                            style={{ width: `${Math.max(1, (p.views / maxViews) * 100)}%` }}
                          />
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
                      {d.byPlatform.map((p) => (
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
                    {d.top.map((p, i) => (
                      <li key={p.id} className="flex items-start gap-3 py-3">
                        <span className="tc w-5 shrink-0 pt-0.5 text-xs text-faint">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/app/clips/${p.clip.id}`} className="block truncate text-sm text-text hover:underline">
                            {p.clip.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-faint">
                            {PLATFORM_LABEL[p.platform]} {p.accountName} · {p.publishedAt && <LocalDateTime iso={p.publishedAt} />}
                            {p.liveUrl && (
                              <a href={p.liveUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-muted hover:text-text">
                                Live <IconExternal size={11} />
                              </a>
                            )}
                          </p>
                        </div>
                        <div className="tc grid shrink-0 grid-cols-3 gap-4 text-right text-xs">
                          <span>
                            <span className="block text-text">{fmt(p.views)}</span>
                            <span className="text-faint">views</span>
                          </span>
                          <span>
                            <span className="block text-text">{fmt(p.likes)}</span>
                            <span className="text-faint">likes</span>
                          </span>
                          <span>
                            <span className="block text-text">{fmt(p.comments)}</span>
                            <span className="text-faint">replies</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            )}
          </>
        );
      }}
    </PageData>
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
