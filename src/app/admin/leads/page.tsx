import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { Logo } from "@/components/logo";
import { IconArrowLeft, IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Leads", robots: { index: false } };

export default async function LeadsPage() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  const [leads, total, converted] = await Promise.all([
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
    db.lead.count(),
    db.lead.count({ where: { source: "converted" } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <Link href="/app" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <IconArrowLeft size={15} /> Back to app
        </Link>
      </div>
      <PageHeader
        title="Leads"
        description={`${total} emails captured from the landing page · ${converted} became accounts.`}
        actions={
          <a href="/api/admin/leads/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-line-strong">
            <IconDownload size={15} /> Export CSV
          </a>
        }
      />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Campaign</th>
              <th className="px-4 py-2.5 font-medium">Referrer</th>
              <th className="px-4 py-2.5 text-right font-medium">Captured</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-text">{l.email}</td>
                <td className="px-4 py-2.5 text-muted">{l.source === "converted" ? <span className="text-ready">Converted</span> : l.source}</td>
                <td className="px-4 py-2.5 text-muted">{[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(" / ") || "—"}</td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-muted">{l.referrer ?? "—"}</td>
                <td className="tc px-4 py-2.5 text-right text-xs text-muted">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">No leads yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
