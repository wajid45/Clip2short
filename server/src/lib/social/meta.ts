import { cred, isConfigured } from "../integrations";
import { api, sleep } from "./http";
import { PublishError, type ConnectedAccountInput, type SocialProvider } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GRAPH = "https://graph.facebook.com/v23.0";

async function exchangeUserToken(code: string, redirectUri: string): Promise<string> {
  const short = await api(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: cred("meta").id!,
      client_secret: cred("meta").secret!,
      redirect_uri: redirectUri,
      code,
    })}`,
  );
  const long = await api(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: cred("meta").id!,
      client_secret: cred("meta").secret!,
      fb_exchange_token: short.access_token,
    })}`,
  );
  return long.access_token;
}

async function listPages(userToken: string): Promise<any[]> {
  const res = await api(
    `${GRAPH}/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
      limit: "100",
      access_token: userToken,
    })}`,
  );
  return res.data ?? [];
}

function authorize(scopes: string[]) {
  return ({ state, redirectUri }: { state: string; redirectUri: string }) =>
    `https://www.facebook.com/v23.0/dialog/oauth?${new URLSearchParams({
      client_id: cred("meta").id ?? "",
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: scopes.join(","),
    })}`;
}

export const facebook: SocialProvider = {
  id: "facebook",
  requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  configured: () => isConfigured("meta"),
  authorizeUrl: authorize(["pages_show_list", "pages_manage_posts", "pages_read_engagement", "read_insights"]),
  async exchange({ code, redirectUri }) {
    const token = await exchangeUserToken(code, redirectUri);
    const pages = await listPages(token);
    if (!pages.length) throw new Error("No Facebook Pages were shared. Posting requires a Page you manage.");
    return pages.map(
      (p): ConnectedAccountInput => ({
        externalId: p.id,
        displayName: p.name,
        avatarUrl: p.picture?.data?.url ?? null,
        accessToken: p.access_token, // page tokens derived from a long-lived user token don't expire
      }),
    );
  },
  async publish(acc, input) {
    const res = await api(`${GRAPH}/${acc.externalId}/feed`, {
      method: "POST",
      form: { message: input.text, link: input.link, access_token: acc.accessToken },
    });
    return { externalId: res.id, liveUrl: `https://www.facebook.com/${res.id}` };
  },
  async stats(acc, id) {
    const r = await api(
      `${GRAPH}/${id}?${new URLSearchParams({
        fields: "shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
        access_token: acc.accessToken,
      })}`,
    );
    let views: number | null = null;
    try {
      const ins = await api(
        `${GRAPH}/${id}/insights?${new URLSearchParams({ metric: "post_impressions", access_token: acc.accessToken })}`,
      );
      views = ins.data?.[0]?.values?.[0]?.value ?? null;
    } catch {
      // insights need read_insights and enough Page followers; keep other stats
    }
    return {
      views,
      likes: r.reactions?.summary?.total_count ?? null,
      comments: r.comments?.summary?.total_count ?? null,
      shares: r.shares?.count ?? 0,
    };
  },
};

export const instagram: SocialProvider = {
  id: "instagram",
  requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  configured: () => isConfigured("meta"),
  authorizeUrl: authorize([
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ]),
  async exchange({ code, redirectUri }) {
    const token = await exchangeUserToken(code, redirectUri);
    const pages = await listPages(token);
    const linked = pages.filter((p) => p.instagram_business_account?.id);
    if (!linked.length)
      throw new Error(
        "No Instagram professional account was found. Link an Instagram Business or Creator account to a Facebook Page, then connect again.",
      );
    return linked.map((p): ConnectedAccountInput => {
      const ig = p.instagram_business_account;
      return {
        externalId: ig.id,
        displayName: ig.name || ig.username,
        username: ig.username,
        avatarUrl: ig.profile_picture_url ?? null,
        accessToken: p.access_token,
        meta: { pageId: p.id },
      };
    });
  },
  async publish(acc, input) {
    if (!input.imageUrl) throw new PublishError("Instagram needs an image, and this video has no thumbnail.");
    const container = await api(`${GRAPH}/${acc.externalId}/media`, {
      method: "POST",
      form: { image_url: input.imageUrl, caption: input.text, access_token: acc.accessToken },
    });
    for (let i = 0; i < 10; i++) {
      const st = await api(
        `${GRAPH}/${container.id}?${new URLSearchParams({ fields: "status_code,status", access_token: acc.accessToken })}`,
      );
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED")
        throw new PublishError(`Instagram couldn't process the image (${st.status ?? st.status_code}).`);
      await sleep(2000);
    }
    const published = await api(`${GRAPH}/${acc.externalId}/media_publish`, {
      method: "POST",
      form: { creation_id: container.id, access_token: acc.accessToken },
    });
    let liveUrl: string | null = null;
    try {
      const m = await api(`${GRAPH}/${published.id}?${new URLSearchParams({ fields: "permalink", access_token: acc.accessToken })}`);
      liveUrl = m.permalink ?? null;
    } catch {
      // permalink is optional
    }
    return { externalId: published.id, liveUrl };
  },
  async stats(acc, id) {
    const m = await api(
      `${GRAPH}/${id}?${new URLSearchParams({ fields: "like_count,comments_count", access_token: acc.accessToken })}`,
    );
    let views: number | null = null;
    let shares: number | null = null;
    try {
      const ins = await api(
        `${GRAPH}/${id}/insights?${new URLSearchParams({ metric: "views,shares", access_token: acc.accessToken })}`,
      );
      for (const d of ins.data ?? []) {
        if (d.name === "views") views = d.values?.[0]?.value ?? null;
        if (d.name === "shares") shares = d.values?.[0]?.value ?? null;
      }
    } catch {
      // insights unavailable for this media
    }
    return { views, likes: m.like_count ?? null, comments: m.comments_count ?? null, shares };
  },
};
