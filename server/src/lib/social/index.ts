import type { SocialAccount } from "@prisma/client";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { env } from "../env";
import { facebook, instagram } from "./meta";
import { sandbox } from "./sandbox";
import { youtube } from "./youtube";
import { loadIntegrations } from "../integrations";
import type { AccountContext, ConnectedAccountInput, SocialPlatform, SocialProvider } from "./types";

export const PROVIDERS: Record<SocialPlatform, SocialProvider> = { youtube, instagram, facebook, sandbox };

export function getProvider(id: string): SocialProvider | null {
  return (PROVIDERS as Record<string, SocialProvider>)[id] ?? null;
}

export function redirectUriFor(platform: string) {
  return `${env.appUrl}/api/social/callback/${platform}`;
}

export async function saveAccounts(userId: string, platform: SocialPlatform, accounts: ConnectedAccountInput[]) {
  for (const a of accounts) {
    const data = {
      displayName: a.displayName,
      username: a.username ?? null,
      avatarUrl: a.avatarUrl ?? null,
      accessTokenEnc: encrypt(a.accessToken),
      refreshTokenEnc: a.refreshToken ? encrypt(a.refreshToken) : null,
      tokenExpiresAt: a.tokenExpiresAt ?? null,
      metaJson: a.meta ? JSON.stringify(a.meta) : null,
      status: "active",
    };
    await db.socialAccount.upsert({
      where: { userId_platform_externalId: { userId, platform, externalId: a.externalId } },
      create: { userId, platform, externalId: a.externalId, ...data },
      update: data,
    });
  }
}

function toContext(a: SocialAccount): AccountContext {
  let accessToken: string;
  let refreshToken: string | null;
  try {
    accessToken = decrypt(a.accessTokenEnc);
    refreshToken = a.refreshTokenEnc ? decrypt(a.refreshTokenEnc) : null;
  } catch {
    // Stored token can't be read (e.g. ENCRYPTION_KEY changed): the user must sign in again.
    throw new Error("This account's sign-in is no longer valid. Reconnect it on the Social accounts page.");
  }
  return {
    id: a.id,
    externalId: a.externalId,
    username: a.username,
    accessToken,
    refreshToken,
    tokenExpiresAt: a.tokenExpiresAt,
    meta: a.metaJson ? (JSON.parse(a.metaJson) as Record<string, unknown>) : {},
  };
}

/** Returns a usable token context, refreshing it first if it expires within 10 minutes. */
export async function accountContext(a: SocialAccount): Promise<AccountContext> {
  await loadIntegrations();
  const ctx = toContext(a);
  const provider = getProvider(a.platform);
  const window = 10 * 60e3;
  if (provider?.refresh && a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() < window) {
    try {
      const r = await provider.refresh(ctx);
      if (r) {
        await db.socialAccount.update({
          where: { id: a.id },
          data: {
            accessTokenEnc: encrypt(r.accessToken),
            refreshTokenEnc: r.refreshToken ? encrypt(r.refreshToken) : a.refreshTokenEnc,
            tokenExpiresAt: r.tokenExpiresAt ?? null,
            status: "active",
          },
        });
        return { ...ctx, accessToken: r.accessToken, refreshToken: r.refreshToken ?? ctx.refreshToken };
      }
    } catch (e) {
      if (a.tokenExpiresAt.getTime() < Date.now()) {
        await db.socialAccount.update({ where: { id: a.id }, data: { status: "expired" } });
        throw new Error(`The ${a.platform} connection expired. Reconnect the account. (${(e as Error).message})`);
      }
    }
  }
  return ctx;
}
