import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProvider, redirectUriFor, saveAccounts } from "@/lib/social";
import { loadIntegrations } from "@/lib/integrations";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import { finishUrl } from "@/lib/social/oauth";

type Ctx = { params: Promise<{ platform: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { platform } = await params;
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");

  // Consume the state first so we know whether this flow runs in a popup.
  const saved = state ? await db.oAuthState.findUnique({ where: { id: state } }) : null;
  if (saved) await db.oAuthState.delete({ where: { id: state! } });
  const popup = saved?.popup ?? false;
  const back = (msg: string, ok = false) => NextResponse.redirect(finishUrl(popup, ok, msg));

  await loadIntegrations();
  const provider = getProvider(platform);
  if (!provider) return back("Unknown platform.");
  if (err) return back(err === "access_denied" ? "You cancelled the sign-in." : `Sign-in was cancelled: ${err}`);
  if (!state || !code) return back("The sign-in response was incomplete. Please try again.");

  const user = await getCurrentUser();
  if (!user || !saved || saved.userId !== user.id || saved.platform !== platform)
    return back("This sign-in expired or belongs to another session. Please try again.");
  if (Date.now() - saved.createdAt.getTime() > 30 * 60e3) return back("This sign-in took too long. Please try again.");

  try {
    const accounts = await provider.exchange({ code, redirectUri: redirectUriFor(platform), codeVerifier: saved.verifier ?? undefined });
    await saveAccounts(user.id, platform as SocialPlatform, accounts);
    const label = PLATFORMS[platform as SocialPlatform]?.label ?? platform;
    return back(`${label}: connected ${accounts.map((a) => a.displayName).join(", ")}.`, true);
  } catch (e) {
    console.error("[social] callback failed", platform, e);
    return back((e as Error).message || "Connecting the account failed.");
  }
}
