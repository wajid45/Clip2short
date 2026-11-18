import clsx from "clsx";
import { useParams } from "react-router";
import type { ClipData, LibraryData, MomentsData } from "@shortlark/shared/api-types";
import { Link, useSearchParams } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { ClipEditor } from "@/components/clip-editor";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { MomentRow } from "@/components/moment-row";
import { LibraryTable } from "@/components/library-table";

export function ClipPage() {
  const { id = "" } = useParams();
  return (
    <PageData<ClipData> key={id} path={`/clips/${encodeURIComponent(id)}`} title={(d) => d.clip.title}>
      {(d) => (
        <ClipEditor
          clip={d.clip}
          video={d.video}
          siblings={d.siblings}
          segments={d.segments}
          suggestion={d.suggestion as Parameters<typeof ClipEditor>[0]["suggestion"]}
          canDownload={d.canDownload}
          accounts={d.accounts}
          posts={d.posts}
        />
      )}
    </PageData>
  );
}

const FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "85", label: "85+", min: 85 },
  { key: "70", label: "70+", min: 70 },
];

export function MomentsPage() {
  const search = useSearchParams().toString();
  return (
    <PageData<MomentsData> path={`/moments${search ? `?${search}` : ""}`} title="Best moments">
      {({ clips, total, page, min, unposted, pageSize }) => {
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
                  scroll={false}
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
                scroll={false}
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
                action={
                  <ButtonLink href="/app" variant="primary">
                    Import a video
                  </ButtonLink>
                }
              />
            ) : (
              <div className="-mx-3 sm:-mx-4">
                {clips.map((c, i) => (
                  <MomentRow key={c.id} clip={c} rank={(page - 1) * pageSize + i + 1} showVideo />
                ))}
              </div>
            )}

            {total > pageSize && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {page > 1 && <ButtonLink href={`/app/moments${qs({ page: page - 1 })}`}>Previous</ButtonLink>}
                <span className="tc px-3 text-sm text-muted">
                  {page} / {Math.ceil(total / pageSize)}
                </span>
                {page * pageSize < total && <ButtonLink href={`/app/moments${qs({ page: page + 1 })}`}>Next</ButtonLink>}
              </div>
            )}
          </>
        );
      }}
    </PageData>
  );
}

export function LibraryPage() {
  const search = useSearchParams().toString();
  return (
    <PageData<LibraryData> path={`/library${search ? `?${search}` : ""}`} title="Clip library">
      {({ rows, total, limit }) => (
        <>
          <PageHeader title="Clip library" description="Every clip across your videos. Filter, select and update in bulk, or export for your editor." />
          <LibraryTable total={total} rows={rows} />
          {total > limit && <p className="mt-3 text-sm text-faint">Showing the first {limit}. Narrow the filters or export to see all {total}.</p>}
        </>
      )}
    </PageData>
  );
}
