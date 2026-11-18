
import { db } from "@server/lib/db";
import { getCurrentUser } from "@server/lib/auth";
import { env } from "@server/lib/env";
import { hasAccess } from "@server/lib/usage";
import { getProvider, redirectUriFor, saveAccounts } from "@server/lib/social";
import { loadIntegrations } from "@server/lib/integrations";
import { assertCanConnectAccount } from "@server/lib/usage";
import { randomToken, sha256base64url } from "@server/lib/crypto";
import { HttpError } from "@server/lib/api";
import { PLATFORMS, type SocialPlatform } from "@server/lib/social/types";
import { finishUrl } from "@server/lib/social/oauth";

type Ctx = { params: Promise<{ platform: string }> };

/**
 * Starts "Log in with …" for a network. Opened in a popup by the Connect button
 * (falls back to a full-page redirect when popups are blocked).
 */
export async function GET(req: Request, { params }: Ctx) {
  const { platform } = await params;
  const popup = new URL(req.url).searchParams.get("popup") === "1";
  const back = (msg: string, ok = false) => Response.redirect(finishUrl(popup, ok, msg));

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${env.appUrl}/login`);
  if (!(await hasAccess(user))) return back("You're out of credits. Buy credits or choose a plan to connect accounts.");
  await loadIntegrations();
  const provider = getProvider(platform);
  if (!provider) return back("Unknown platform.");
  const label = PLATFORMS[platform as SocialPlatform]?.label ?? platform;
  if (!provider.configured()) return back(`${label} sign-in isn't set up on this workspace yet.`);

  if (platform === "sandbox") {
    await saveAccounts(user.id, "sandbox", await provider.exchange({ code: "", redirectUri: "" }));
    return back("Sandbox account added.", true);
  }
  try {
    await assertCanConnectAccount(user);
  } catch (e) {
    return back(e instanceof HttpError ? e.message : "Can't connect another account.");
  }

  await db.oAuthState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 60e3) } } });
  const state = randomToken(24);
  const verifier = provider.usesPkce ? randomToken(48) : null;
  await db.oAuthState.create({ data: { id: state, userId: user.id, platform, verifier, popup } });
  return Response.redirect(
    provider.authorizeUrl({
      state,
      redirectUri: redirectUriFor(platform),
      codeChallenge: verifier ? sha256base64url(verifier) : undefined,
    }),
  );
}
