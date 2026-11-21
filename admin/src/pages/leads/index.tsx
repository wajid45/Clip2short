import { IconDownload } from "@shortlark/shared/components/icons";
import { Alert, Badge, Card, Empty, PageHeader, Spinner, Stat, Table } from "../../components/ui";
import { apiUrl, fullDate, num, useLive } from "../../lib/api";

interface Lead {
  id: string;
  email: string;
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  signups: number;
  createdAt: string;
}

/** Emails captured on the landing site, and which of them became accounts. */
export function LeadsPage() {
  const live = useLive<{ leads: Lead[]; total: number; converted: number }>("/leads", 60_000);
  const d = live.data;
  return (
    <>
      <PageHeader
        title="Leads"
        updatedAt={live.updatedAt}
        loading={live.loading}
        onRefresh={() => void live.refresh()}
        action={
          <a href={apiUrl("/api/portal/leads/export")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-text hover:border-line-strong">
            <IconDownload size={14} /> Export CSV
          </a>
        }
      />
      {live.error && <Alert kind="error">{live.error}</Alert>}
      {!d ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Leads" value={num(d.total)} />
            <Stat label="Became accounts" value={num(d.converted)} />
            <Stat label="Conversion" value={d.total ? `${Math.round((d.converted / d.total) * 100)}%` : "0%"} />
          </div>
          <Card pad={false}>
            {d.leads.length === 0 ? (
              <Empty title="No leads yet" body="Emails entered on the landing page show here." />
            ) : (
              <Table head={["Email", "Source", "Campaign", "Referrer", "Captured"]}>
                {d.leads.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-text">{l.email}</td>
                    <td className="px-4 py-3">{l.source === "converted" ? <Badge tone="success">Converted</Badge> : <span className="text-muted">{l.source}</span>}</td>
                    <td className="px-4 py-3 text-muted">{[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(" / ") || "·"}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted">{l.referrer ?? "·"}</td>
                    <td className="px-4 py-3 text-muted">{fullDate(l.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
