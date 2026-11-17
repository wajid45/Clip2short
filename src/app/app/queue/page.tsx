import clsx from "clsx";
import Link from "next/link";
import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { PLATFORM_LABEL, POST_STATUS } from "@/components/badges";
import { PostActions } from "@/components/post-actions";
import { LocalTime } from "@/components/local-time";
import { DayGroups } from "@/components/day-groups";
import { IconExternal } from "@/components/icons";
import { QueueRefresher } from "@/components/queue-refresher";

export const metadata: Metadata = { title: "Queue" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireSubscriber();
  const { view } = await searchParams;
  const history = view === "history";

  const posts = await db.post.findMany({
    where: history
      ? { userId: user.id, status: { in: ["published", "canceled"] } }
      : { userId: user.id, status: { in: ["queued", "scheduled", "publishing", "failed"] } },
    orderBy: history ? [{ publishedAt: "desc" }, { updatedAt: "desc" }] : [{ scheduledAt: { sort: "asc", nulls: "first" } }],
    take: history ? 200 : 500,
    include: { clip: { select: { id: true, title: true, video: { select: { title: true } } } } },
  });

  const failed = posts.filter((p) => p.status === "failed");
  const upcoming = posts.filter((p) => p.status !== "failed");
  const busy = posts.some((p) => p.status === "publishing" || (p.status === "queued" && !p.scheduledAt));

  // Group by the post's time (ISO). Day boundaries are rendered in the viewer's time zone on the client.
  const items = (history ? posts : upcoming).map((p) => ({
    id: p.id,
    at: (history ? (p.publishedAt ?? p.updatedAt) : (p.scheduledAt ?? p.createdAt)).toISOString(),
    p,
  }));

  return (
    <>
      <QueueRefresher active={busy} />
      <PageHeader
        title="Queue"
        description="Scheduled posts publish automatically. The publisher runs every 15 minutes, on the quarter hour."
        actions={
          <div className="inline-flex rounded-lg border border-line p-0.5">
            <Link href="/app/queue" className={clsx("rounded-md px-3 py-1.5 text-sm", !history ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
              Upcoming
            </Link>
            <Link href="/app/queue?view=history" className={clsx("rounded-md px-3 py-1.5 text-sm", history ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
              History
            </Link>
          </div>
        }
      />

      {!history && failed.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-danger">Needs attention · {failed.length}</h2>
          <ul className="divide-y divide-line rounded-xl border border-danger/30">
            {failed.map((p) => (
              <li key={p.id}>
                <PostRow p={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <EmptyState
          title={history ? "Nothing published yet" : "The queue is empty"}
          body={history ? "Published and canceled posts appear here." : "Open a clip and schedule it from the Post this clip panel."}
          action={!history ? <ButtonLink href="/app/moments" variant="primary">Pick a moment</ButtonLink> : undefined}
        />
      ) : (
        <DayGroups items={items.map((it) => ({ id: it.id, at: it.at, node: <PostRow p={it.p} /> }))} />
      )}
    </>
  );
}

type Row = Awaited<ReturnType<typeof db.post.findMany<{ include: { clip: { select: { id: true; title: true; video: { select: { title: true } } } } } }>>>[number];

function PostRow({ p }: { p: Row }) {
  const when = p.publishedAt ?? p.scheduledAt;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <div className="tc w-16 shrink-0 pt-0.5 text-sm text-text">{when ? <LocalTime iso={when.toISOString()} /> : p.status === "failed" ? <LocalTime iso={p.updatedAt.toISOString()} /> : "Now"}</div>
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium text-text">{PLATFORM_LABEL[p.platform]}</span> <span className="text-faint">{p.accountName}</span>
            <span className={clsx("ml-2 text-xs font-medium", POST_STATUS[p.status]?.cls)}>{POST_STATUS[p.status]?.label}</span>
          </p>
          <Link href={`/app/clips/${p.clip.id}`} className="mt-0.5 block truncate text-sm text-muted hover:text-text">
            {p.clip.title} <span className="text-faint">· {p.clip.video.title}</span>
          </Link>
          <p className="mt-1 line-clamp-2 text-xs text-faint">{p.text}</p>
          {p.error && <p className="mt-1 text-xs text-danger">{p.error}</p>}
          {p.liveUrl && (
            <a href={p.liveUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-published hover:underline">
              View live post <IconExternal size={12} />
            </a>
          )}
        </div>
      </div>
      <PostActions id={p.id} status={p.status} />
    </div>
  );
}
