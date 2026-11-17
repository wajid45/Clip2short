import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { cred, INTEGRATIONS, isConfigured, loadIntegrations } from "@/lib/integrations";
import { Card, PageHeader } from "@/components/ui";
import { Logo } from "@/components/logo";
import { CopyField, IntegrationForm } from "@/components/integration-form";
import { PlatformIcon } from "@/components/platform-icon";
import { IconArrowLeft, IconExternal } from "@/components/icons";

export const metadata: Metadata = { title: "Integrations", robots: { index: false } };

export default async function IntegrationsPage() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  await loadIntegrations(true);
  const saved = await db.integrationSetting.findMany();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <Link href="/app/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <IconArrowLeft size={15} /> Back to app
        </Link>
      </div>
      <PageHeader
        title="Integrations"
        description="Register one developer app per network, once. After that every customer simply clicks Connect and signs in with their own account. This is how Buffer, Hootsuite and other schedulers work."
      />
      <div className="space-y-5">
        {INTEGRATIONS.map((i) => {
          const c = cred(i.id);
          const row = saved.find((s) => s.id === i.id);
          const on = isConfigured(i.id);
          return (
            <Card key={i.id} className="p-6" >
              <div id={i.id} className="scroll-mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1.5">
                      {i.platforms.map((p) => (
                        <PlatformIcon key={p} platform={p} size={28} />
                      ))}
                    </div>
                    <h2 className="text-lg font-semibold">{i.name}</h2>
                    <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-medium ${on ? "bg-ready/15 text-ready" : "bg-surface-3 text-faint"}`}>
                      {on ? "Live" : "Not set up"}
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
                    <p className="text-xs font-medium text-muted">Redirect URI{i.platforms.length > 1 ? "s" : ""} to register</p>
                    {i.platforms.map((p) => (
                      <CopyField key={p} value={`${env.appUrl}/api/social/callback/${p}`} />
                    ))}
                  </div>
                </div>
                <IntegrationForm
                  id={i.id}
                  idLabel={i.idLabel}
                  secretLabel={i.secretLabel}
                  secretOptional={i.secretOptional}
                  savedClientId={row?.clientId ?? (c.source === "env" ? (c.id ?? "") : "")}
                  hasSavedSecret={Boolean(row?.clientSecretEnc)}
                  source={c.source}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
