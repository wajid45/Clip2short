import clsx from "clsx";
import type { Jsonify, QueueData } from "@server/page-routes";
import { IconExternal } from "@shortlark/shared/components/icons";
import { Link, useSearchParams } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { PLATFORM_LABEL, POST_STATUS } from "@/components/badges";
import { PostActions } from "@/components/post-actions";
import { LocalTime } from "@/components/local-time";
import { DayGroups } from "@/components/day-groups";
import { QueueRefresher } from "@/components/queue-refresher";

type Row = Jsonify<QueueData>["posts"][number];

export function QueuePage() {
  const history = useSearchParams().get("view") === "history";
  return (
    <PageData<QueueData> path={`/queue${history ? "?view=history" : ""}`} title="Queue">
      {({ posts }) => {
        const failed = posts.filter((p) => p.status === "failed");
        const upcoming = posts.filter((p) => p.status !== "failed");
        const busy = posts.some((p) => p.status === "publishing" || (p.status === "queued" && !p.scheduledAt));
        // Group by the post's time. Day boundaries are drawn in the viewer's time zone.
        const items = (history ? posts : upcoming).map((p) => ({
          id: p.id,
          at: history ? (p.publishedAt ?? p.updatedAt) : (p.scheduledAt ?? p.createdAt),
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
                  <Link href="/app/queue" scroll={false} className={clsx("rounded-md px-3 py-1.5 text-sm", !history ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                    Upcoming
                  </Link>
                  <Link
                    href="/app/queue?view=history"
                    scroll={false}
                    className={clsx("rounded-md px-3 py-1.5 text-sm", history ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
                  >
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
                action={
                  !history ? (
                    <ButtonLink href="/app/moments" variant="primary">
                      Pick a moment
                    </ButtonLink>
                  ) : undefined
                }
              />
            ) : (
              <DayGroups items={items.map((it) => ({ id: it.id, at: it.at, node: <PostRow p={it.p} /> }))} />
            )}
          </>
        );
      }}
    </PageData>
  );
}

function PostRow({ p }: { p: Row }) {
  const when = p.publishedAt ?? p.scheduledAt;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <div className="tc w-16 shrink-0 pt-0.5 text-sm text-text">
          {when ? <LocalTime iso={when} /> : p.status === "failed" ? <LocalTime iso={p.updatedAt} /> : "Now"}
        </div>
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
