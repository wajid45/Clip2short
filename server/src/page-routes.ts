import { Router } from "express";
import { route } from "./http/adapter";
import { handle, json } from "./lib/api";
import { loadMe } from "./pages/me";
import { loadVideo, loadVideos } from "./pages/videos";
import { loadClip } from "./pages/clip";
import { loadAnalytics, loadLibrary, loadMoments, loadQueue } from "./pages/lists";
import { loadAccounts, loadIntegrationsPage, loadLeads } from "./pages/admin";
import { loadBilling } from "./pages/billing";

/**
 * Page data for the web app: one GET endpoint per screen, mounted under /api/page.
 * Each loader enforces auth itself (401 signed out, 402 out of credits, 404 not yours).
 */
type Loader = (query: URLSearchParams, params: Record<string, string>) => Promise<unknown>;

function page(loader: Loader) {
  return route(
    handle(async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
      const data = await loader(new URL(req.url).searchParams, await ctx.params);
      return json(data, { headers: { "Cache-Control": "no-store" } });
    }),
  );
}

export const pageRouter = Router();

pageRouter.get("/me", page(() => loadMe()));
pageRouter.get("/videos", page(() => loadVideos()));
pageRouter.get("/videos/:id", page((_q, p) => loadVideo(p.id)));
pageRouter.get("/clips/:id", page((_q, p) => loadClip(p.id)));
pageRouter.get("/moments", page((q) => loadMoments(q)));
pageRouter.get("/library", page((q) => loadLibrary(q)));
pageRouter.get("/queue", page((q) => loadQueue(q)));
pageRouter.get("/analytics", page((q) => loadAnalytics(q)));
pageRouter.get("/accounts", page(() => loadAccounts()));
pageRouter.get("/billing", page((q) => loadBilling(q)));
pageRouter.get("/admin/leads", page(() => loadLeads()));
pageRouter.get("/admin/integrations", page(() => loadIntegrationsPage()));

/** Response types for the web app, as they arrive over JSON. */
export type { Jsonify } from "@shortlark/shared/json";
export type MeData = Awaited<ReturnType<typeof loadMe>>;
export type VideosData = Awaited<ReturnType<typeof loadVideos>>;
export type VideoData = Awaited<ReturnType<typeof loadVideo>>;
export type ClipData = Awaited<ReturnType<typeof loadClip>>;
export type MomentsData = Awaited<ReturnType<typeof loadMoments>>;
export type LibraryData = Awaited<ReturnType<typeof loadLibrary>>;
export type QueueData = Awaited<ReturnType<typeof loadQueue>>;
export type AnalyticsData = Awaited<ReturnType<typeof loadAnalytics>>;
export type AccountsData = Awaited<ReturnType<typeof loadAccounts>>;
export type BillingData = Awaited<ReturnType<typeof loadBilling>>;
export type LeadsData = Awaited<ReturnType<typeof loadLeads>>;
export type IntegrationsData = Awaited<ReturnType<typeof loadIntegrationsPage>>;
