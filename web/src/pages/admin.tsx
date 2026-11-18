import type { IntegrationsData, LeadsData } from "@shortlark/shared/api-types";
import { Logo } from "@shortlark/shared/components/logo";
import { PlatformIcon } from "@shortlark/shared/components/platform-icon";
import { IconArrowLeft, IconDownload, IconExternal } from "@shortlark/shared/components/icons";
import { Link } from "@/lib/nav";
import { PageData } from "@/lib/page-data";
import { Card, PageHeader } from "@/components/ui";
import { CopyField, IntegrationForm } from "@/components/integration-form";

function AdminHeader({ back, label }: { back: string; label: string }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <Logo />
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <IconArrowLeft size={15} /> {label}
      </Link>
    </div>
  );
}

export function LeadsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <AdminHeader back="/app" label="Back to app" />
      <PageData<LeadsData> path="/admin/leads" title="Leads">
        {({ leads, total, converted }) => (
          <>
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
                      <td className="tc px-4 py-2.5 text-right text-xs text-muted">{l.createdAt.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted">
                        No leads yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageData>
    </div>
  );
}

export function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <AdminHeader back="/app/accounts" label="Back to app" />
      <PageData<IntegrationsData> path="/admin/integrations" title="Integrations">
        {({ integrations }) => (
          <>
            <PageHeader
              title="Integrations"
              description="Register one developer app per network, once. After that every customer simply clicks Connect and signs in with their own account. This is how Buffer, Hootsuite and other schedulers work."
            />
            <div className="space-y-5">
              {integrations.map((i) => (
                <Card key={i.id} className="p-6">
                  <div id={i.id} className="grid scroll-mt-8 gap-8 lg:grid-cols-[1.1fr_1fr]">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-1.5">
                          {i.platforms.map((p) => (
                            <PlatformIcon key={p} platform={p} size={28} />
                          ))}
                        </div>
                        <h2 className="text-lg font-semibold">{i.name}</h2>
                        <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-medium ${i.live ? "bg-ready/15 text-ready" : "bg-surface-3 text-faint"}`}>
                          {i.live ? "Live" : "Not set up"}
                        </span>
                      </div>
                      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                        {i.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <a href={i.consoleUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-text hover:underline">
                        Open developer console <IconExternal size={13} />
                      </a>
                      <div className="mt-5 space-y-2">
                        <p className="text-xs font-medium text-muted">Redirect URI{i.redirectUris.length > 1 ? "s" : ""} to register</p>
                        {i.redirectUris.map((uri) => (
                          <CopyField key={uri} value={uri} />
                        ))}
                      </div>
                    </div>
                    <IntegrationForm
                      id={i.id}
                      idLabel={i.idLabel}
                      secretLabel={i.secretLabel}
                      secretOptional={i.secretOptional}
                      savedClientId={i.savedClientId}
                      hasSavedSecret={i.hasSavedSecret}
                      source={i.source}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </PageData>
    </div>
  );
}
