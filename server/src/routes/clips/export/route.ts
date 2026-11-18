import { db } from "@server/lib/db";
import { apiUser, handle } from "@server/lib/api";
import { clipOrder, clipWhere, filtersFromParams } from "@server/lib/clips";
import { formatTimecode } from "@shortlark/shared/time";
import { timestampUrl } from "@server/lib/video/source";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Exports clips (selected ids, or the current filters) as CSV or JSON. */
export const GET = handle(async (req: Request) => {
  const user = await apiUser();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const where = ids?.length ? { userId: user.id, id: { in: ids } } : clipWhere(user.id, filtersFromParams(url.searchParams));
  const clips = await db.clip.findMany({ where, orderBy: clipOrder(url.searchParams.get("sort") ?? undefined), include: { video: true } });

  const rows = clips.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    score: c.score,
    category: c.category,
    video: c.video.title,
    source: c.video.platform,
    start: formatTimecode(c.startSec, true),
    end: formatTimecode(c.endSec, true),
    startSec: c.startSec,
    endSec: c.endSec,
    durationSec: Math.round((c.endSec - c.startSec) * 10) / 10,
    link: timestampUrl(c.video, c.startSec),
    hook: c.hook,
    caption: c.caption,
    hashtags: c.hashtags,
    reason: c.reason,
    notes: c.notes,
    transcript: c.transcript,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="clips-${stamp}.json"`,
      },
    });
  }
  const header = Object.keys(rows[0] ?? { id: "" });
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h as keyof typeof r])).join(","))].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clips-${stamp}.csv"`,
    },
  });
});
