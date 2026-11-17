import { db } from "@/lib/db";
import { apiUser, handle, HttpError } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const GET = handle(async () => {
  const user = await apiUser();
  if (!isAdmin(user)) throw new HttpError(404, "Not found");
  const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" } });
  const cols = ["email", "source", "utmSource", "utmMedium", "utmCampaign", "referrer", "signups", "createdAt"] as const;
  const csv = [cols.join(","), ...leads.map((l) => cols.map((c) => cell(c === "createdAt" ? l.createdAt.toISOString() : l[c])).join(","))].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
