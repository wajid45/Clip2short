import clsx from "clsx";
import { Link } from "@/lib/nav";
import { usePathname, useRouter, useSearchParams } from "@/lib/nav";
import { useEffect, useState, useTransition } from "react";
import { apiFetch, apiUrl } from "@/lib/client";
import { formatDuration, formatTimecode } from "@shortlark/shared/time";
import { Button, inputClass } from "./ui";
import { CATEGORY_LABEL, PLATFORM_LABEL, STATUS_META, ScoreBadge, StatusBadge } from "./badges";
import { IconDownload, IconSearch, IconTrash } from "@shortlark/shared/components/icons";
import { Select } from "@shortlark/shared/components/select";

export interface LibraryRow {
  id: string;
  title: string;
  status: string;
  score: number | null;
  category: string | null;
  startSec: number;
  endSec: number;
  videoTitle: string;
  source: string;
  updatedAt: string;
  posts: number;
}


export function LibraryTable({ rows, total }: { rows: LibraryRow[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);

  // Drop selections that are no longer visible after filtering.
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulk(action: "status" | "delete", status?: string) {
    const ids = [...selected];
    if (action === "delete" && !confirm(`Delete ${ids.length} ${ids.length === 1 ? "clip" : "clips"}? Their post history is deleted too.`)) return;
    setBusy(true);
    try {
      await apiFetch("/api/clips/bulk", { method: "POST", json: { action, ids, status } });
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [zipFormat, setZipFormat] = useState<"original" | "vertical">("original");
  const [zipping, setZipping] = useState(false);

  /** The selected clips as one ZIP of MP4s. Clips from YouTube or Vimeo are listed in skipped.txt. */
  async function downloadZip() {
    setZipping(true);
    try {
      const res = await fetch(apiUrl(`/api/clips/zip?ids=${[...selected].join(",")}&format=${zipFormat}`), { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "The download failed. Please try again.");
      }
      const blob = await res.blob();
      const name = /filename="?([^";]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "clip2short-clips.zip";
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setZipping(false);
    }
  }

  function exportHref(format: "csv" | "json") {
    const p = new URLSearchParams(params.toString());
    p.set("format", format);
    if (selected.size) p.set("ids", [...selected].join(","));
    return apiUrl(`/api/clips/export?${p.toString()}`);
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, hooks, captions, notes, transcript…"
            className={clsx(inputClass, "h-9 pl-9")}
            aria-label="Search clips"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            ariaLabel="Status"
            size="sm"
            value={params.get("status") ?? ""}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "", label: "All statuses" }, ...Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))]}
          />
          <Select
            ariaLabel="Source"
            size="sm"
            value={params.get("source") ?? ""}
            onChange={(v) => setParam("source", v)}
            options={[
              { value: "", label: "All sources" },
              { value: "youtube", label: "YouTube" },
              { value: "vimeo", label: "Vimeo" },
              { value: "direct", label: "File link" },
            ]}
          />
          <Select
            ariaLabel="Category"
            size="sm"
            value={params.get("category") ?? ""}
            onChange={(v) => setParam("category", v)}
            options={[{ value: "", label: "All categories" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]}
          />
          <Select
            ariaLabel="Minimum score"
            size="sm"
            value={params.get("minScore") ?? ""}
            onChange={(v) => setParam("minScore", v)}
            options={[
              { value: "", label: "Any score" },
              { value: "85", label: "85+" },
              { value: "70", label: "70+" },
              { value: "50", label: "50+" },
            ]}
          />
          <Select
            ariaLabel="Sort"
            size="sm"
            menuClassName="right-0 left-auto"
            value={params.get("sort") ?? "score"}
            onChange={(v) => setParam("sort", v === "score" ? "" : v)}
            options={[
              { value: "score", label: "Highest score" },
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "title", label: "Title A to Z" },
              { value: "start", label: "Video order" },
            ]}
          />
        </div>
      </div>

      {/* Bulk bar */}
      <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {selected.size ? (
            <span className="text-text">{selected.size} selected</span>
          ) : (
            <>
              <span className="tc">{total}</span> {total === 1 ? "clip" : "clips"}
            </>
          )}
          {pending && <span className="ml-2 text-faint">Updating…</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <>
              <Select
                ariaLabel="Set status for selected"
                size="sm"
                value=""
                disabled={busy}
                onChange={(v) => v && bulk("status", v)}
                options={[{ value: "", label: "Set status…" }, ...Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))]}
              />
              <div className="flex items-center gap-1.5">
                <Select
                  ariaLabel="Video shape for the download"
                  size="sm"
                  className="w-36"
                  value={zipFormat}
                  onChange={(v) => setZipFormat(v as "original" | "vertical")}
                  options={[
                    { value: "original", label: "Original shape" },
                    { value: "vertical", label: "Vertical 9:16" },
                  ]}
                />
                <Button size="sm" onClick={() => void downloadZip()} loading={zipping} disabled={selected.size > 20} title={selected.size > 20 ? "Download up to 20 clips at a time" : undefined}>
                  <IconDownload size={14} /> Download ZIP
                </Button>
              </div>
              <Button size="sm" variant="danger" onClick={() => bulk("delete")} loading={busy}>
                <IconTrash size={14} /> Delete
              </Button>
            </>
          )}
          <a href={exportHref("csv")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-text hover:border-line-strong">
            <IconDownload size={14} /> {selected.size ? "Export selected" : "Export"} CSV
          </a>
          <a href={exportHref("json")} className="inline-flex h-8 items-center rounded-lg px-2 text-[13px] text-text hover:bg-surface-2">
            JSON
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs text-muted">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="accent-signal" />
              </th>
              <th className="px-2 py-2.5 font-medium">Score</th>
              <th className="px-2 py-2.5 font-medium">Clip</th>
              <th className="px-2 py-2.5 font-medium">Timecode</th>
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="px-2 py-2.5 font-medium">Category</th>
              <th className="px-2 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 text-right font-medium">Posts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx("border-b border-line last:border-0 hover:bg-surface", selected.has(r.id) && "bg-signal-soft")}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} className="accent-signal" />
                </td>
                <td className="px-2 py-3">
                  <ScoreBadge score={r.score} size="sm" />
                </td>
                <td className="max-w-[360px] px-2 py-3">
                  <Link href={`/app/clips/${r.id}`} className="block truncate font-medium text-text hover:underline">
                    {r.title}
                  </Link>
                  <span className="block truncate text-xs text-faint">{r.videoTitle}</span>
                </td>
                <td className="tc px-2 py-3 text-xs whitespace-nowrap text-muted">
                  {formatTimecode(r.startSec)} <span className="text-faint">· {formatDuration(r.endSec - r.startSec)}</span>
                </td>
                <td className="px-2 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-2 py-3 text-xs text-muted">{r.category ? CATEGORY_LABEL[r.category] : "·"}</td>
                <td className="px-2 py-3 text-xs text-muted">{PLATFORM_LABEL[r.source]}</td>
                <td className="tc px-3 py-3 text-right text-xs text-muted">{r.posts || "·"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-14 text-center text-sm text-muted">
                  No clips match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
