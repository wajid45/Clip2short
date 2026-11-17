import "server-only";
import { env } from "../env";
import { randomToken } from "../crypto";
import type { SocialProvider } from "./types";

/**
 * Development-only provider. Simulates publishing so the full flow (queue,
 * schedule, publish, failures, stats) can be exercised without real accounts.
 * Text containing "#fail" fails on purpose, to test failure handling.
 */
export const sandbox: SocialProvider = {
  id: "sandbox",
  requiredEnv: [],
  configured: () => env.socialSandbox,
  authorizeUrl: () => "",
  async exchange() {
    return [
      {
        externalId: `sandbox-${randomToken(6)}`,
        displayName: "Sandbox account",
        username: "sandbox",
        accessToken: "sandbox",
      },
    ];
  },
  async publish(_acc, input) {
    await new Promise((r) => setTimeout(r, 400));
    if (/#fail\b/i.test(input.text)) throw new Error("Sandbox: simulated failure because the text contains #fail.");
    const id = `sbx_${randomToken(8)}`;
    return { externalId: id, liveUrl: `${env.appUrl}/app/queue?post=${id}` };
  },
  async stats(_acc, id) {
    // Deterministic, slowly growing numbers so analytics are testable.
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const age = 1 + ((Date.now() / 3.6e6) % 48);
    const views = Math.round((200 + (h % 5000)) * Math.log2(1 + age));
    return { views, likes: Math.round(views * 0.06), comments: Math.round(views * 0.008), shares: Math.round(views * 0.01) };
  },
};
