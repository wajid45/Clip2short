import Link from "next/link";
import type { Metadata } from "next";
import { requireSubscriber, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsFor } from "@/lib/plans";
import { PROVIDERS } from "@/lib/social";
import { integrationFor, loadIntegrations } from "@/lib/integrations";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import { Card, Notice, PageHeader, buttonClass } from "@/components/ui";
import { DisconnectButton } from "@/components/disconnect-button";
import { ConnectButton } from "@/components/connect-button";
import { PlatformIcon } from "@/components/platform-icon";

export const metadata: Metadata = { title: "Social accounts" };

const ORDER: SocialPlatform[] = ["youtube", "instagram", "facebook", "sandbox"];

const NOTES: Partial<Record<SocialPlatform, string>> = {
  youtube: "Upload your clip as a Short (vertical, up to 3 min) or a regular video, now or scheduled.",
  instagram: "Business or Creator accounts linked to a Facebook Page.",
  facebook: "Posts to the Facebook Pages you manage.",
  sandbox: "Development only. Simulates publishing. Add #fail to a post to test failures.",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireSubscriber();
  const sp = await searchParams;
  await loadIntegrations();
  const limits = limitsFor(user);
  const accounts = await db.socialAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const realCount = accounts.filter((a) => a.platform !== "sandbox").length;
  const admin = isAdmin(user);

  return (
    <>
      <PageHeader
        title="Social accounts"
        description="Click Connect and sign in with the account you want to post to. Your password never touches Shortlark; access can be revoked here or in the network's settings at any time."
        actions={
          <span className="tc text-sm text-muted">
            {realCount}/{limits.socialAccounts} connected
          </span>
        }
      />
      <div className="mb-6 space-y-3">
        {sp.connected && <Notice tone="success">{sp.connected}</Notice>}
        {sp.error && <Notice tone="error">{sp.error}</Notice>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ORDER.filter((p) => p !== "sandbox" || PROVIDERS.sandbox.configured()).map((p) => {
          const provider = PROVIDERS[p];
          const info = PLATFORMS[p];
          const mine = accounts.filter((a) => a.platform === p);
          const configured = provider.configured();
          const integration = integrationFor(p);
          return (
            <Card key={p} className="flex flex-col p-5">
              <div className="flex items-start gap-4">
                <PlatformIcon platform={p} size={40} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">{info.label}</h2>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{NOTES[p] ?? info.format}</p>
                </div>
                <div className="shrink-0">
                  {configured ? (
                    <ConnectButton
                      platform={p}
                      variant={mine.length ? "secondary" : "primary"}
                      label={mine.length ? (p === "sandbox" ? "Add another" : "Add account") : "Connect"}
                    />
                  ) : admin && integration ? (
                    <Link href={`/admin/integrations#${integration.id}`} className={buttonClass("secondary", "sm")}>
                      Set up
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 items-center rounded-lg bg-surface-3 px-3 text-xs text-faint">Coming soon</span>
                  )}
                </div>
              </div>
              {!configured && admin && integration && (
                <p className="mt-3 text-xs text-draft">
                  Admin: register the {integration.name} developer app once in Integrations; then every customer can connect with one click.
                </p>
              )}
              {mine.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {mine.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" /> : <div className="size-8 rounded-full bg-surface-3" />}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-text">{a.displayName}</p>
                          <p className="truncate text-xs text-faint">
                            {a.username ? `@${a.username}` : ""}
                            {a.status !== "active" && <span className="ml-1 text-danger">Needs reconnecting</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {a.status !== "active" && configured && <ConnectButton platform={p} variant="secondary" label="Reconnect" />}
                        <DisconnectButton id={a.id} name={a.displayName} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
