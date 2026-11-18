import { isAdmin, requireSubscriber, requireUser } from "@server/lib/auth";
import { db } from "@server/lib/db";
import { env } from "@server/lib/env";
import { HttpError } from "@server/lib/api";
import { PROVIDERS } from "@server/lib/social";
import { cred, INTEGRATIONS, integrationFor, isConfigured, loadIntegrations } from "@server/lib/integrations";
import { limitsFor } from "@shortlark/shared/plans";
import type { SocialPlatform } from "@shortlark/shared/social";

const ORDER: SocialPlatform[] = ["youtube", "instagram", "facebook", "sandbox"];

export async function loadAccounts() {
  const user = await requireSubscriber();
  await loadIntegrations();
  const accounts = await db.socialAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, platform: true, displayName: true, username: true, avatarUrl: true, status: true },
  });
  const admin = isAdmin(user);
  const platforms = ORDER.filter((p) => p !== "sandbox" || PROVIDERS.sandbox.configured()).map((p) => {
    const integration = admin ? integrationFor(p) : undefined;
    return { id: p, configured: PROVIDERS[p].configured(), integrationId: integration?.id ?? null, integrationName: integration?.name ?? null };
  });
  return {
    accounts,
    platforms,
    connectedCount: accounts.filter((a) => a.platform !== "sandbox").length,
    accountLimit: limitsFor(user).socialAccounts,
    isAdmin: admin,
  };
}

async function requireAdmin() {
  const user = await requireUser();
  // 404 rather than 403, so the admin area isn't discoverable.
  if (!isAdmin(user)) throw new HttpError(404, "Not found.");
  return user;
}

export async function loadLeads() {
  await requireAdmin();
  const [leads, total, converted] = await Promise.all([
    db.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, email: true, source: true, utmSource: true, utmMedium: true, utmCampaign: true, referrer: true, createdAt: true },
    }),
    db.lead.count(),
    db.lead.count({ where: { source: "converted" } }),
  ]);
  return { leads, total, converted };
}

export async function loadIntegrationsPage() {
  await requireAdmin();
  await loadIntegrations(true);
  const saved = await db.integrationSetting.findMany({ select: { id: true, clientId: true, clientSecretEnc: true } });
  return {
    integrations: INTEGRATIONS.map((i) => {
      const c = cred(i.id);
      const row = saved.find((s) => s.id === i.id);
      return {
        id: i.id,
        name: i.name,
        platforms: i.platforms,
        steps: i.steps,
        consoleUrl: i.consoleUrl,
        idLabel: i.idLabel,
        secretLabel: i.secretLabel,
        secretOptional: i.secretOptional,
        live: isConfigured(i.id),
        redirectUris: i.platforms.map((p) => `${env.appUrl}/api/social/callback/${p}`),
        savedClientId: row?.clientId ?? (c.source === "env" ? (c.id ?? "") : ""),
        hasSavedSecret: Boolean(row?.clientSecretEnc),
        source: c.source,
      };
    }),
  };
}
