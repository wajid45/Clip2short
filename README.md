# Shortlark

Shortlark turns long videos into short clips that are ready to post. Paste a YouTube or direct video link, and the AI finds the best moments and cuts them into vertical Shorts and Reels with captions. It also writes the title, caption and hashtags for each clip. You review and fine-tune clips in the editor, then post on social media or schedule it.

Clips can also be downloaded as vertical MP4s.

Stack: Node + Express API · React 19 + Vite (web app and landing page) · TypeScript · Tailwind CSS 4 · Prisma (SQLite locally, Postgres in production) · Stripe · Claude API (`claude-opus-5-5`).

## Project layout

One repository, npm workspaces:

| Folder | What it is | Dev URL |
|---|---|---|
| `server/` | Express API: auth, credits, Stripe, AI analysis, video cutting, social publishing, the 15-minute scheduler. The Prisma schema and database live in `server/prisma`. | http://localhost:4000 |
| `web/` | The signed-in web app: a React + Vite single-page app with React Router. | http://localhost:3000 |
| `landing/` | The marketing site: React + Vite, **pre-rendered to static HTML** at build time for SEO and link previews. | http://localhost:3001 |
| `shared/` | Code all three use: pricing (`plans.ts`), time helpers, link parsing, platform metadata, brand components and the Tailwind design tokens. | |

The web app and the API share one origin. In development Vite proxies `/api` to the Express server; in production the Express server also serves `web/dist`. That keeps the session cookie first-party and needs no CORS. The landing page is a separate static site: it links into the web app and may call only the public lead endpoint (CORS allows `LANDING_URL`).

## Quick start (local)

```bash
npm install
cp server/.env.example server/.env    # then fill in what you have
npm run db:push                       # creates server/prisma/dev.db
npm run dev                           # API :4000, web app :3000, landing :3001
```

Optional: copy `web/.env.example` and `landing/.env.example` to `.env` in their folders to change the links between the two sites.

With no keys set, local development still works end to end:

- **Billing**: plans and packs activate instantly from the Billing page (dev mode, disabled in production and whenever Stripe keys exist).
- **Social**: a *Sandbox* account simulates publishing. Put `#fail` in a post to test failure handling.
- **AI**: imports and captions work. Moment-finding needs `ANTHROPIC_API_KEY`.

## Environment

See `server/.env.example` for every API variable. Required in production: `DATABASE_URL`, `APP_URL`, `LANDING_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, and the Stripe variables.

Build-time variables for the front ends: `VITE_APP_URL` and `VITE_API_URL` (landing), `VITE_LANDING_URL` (web).

## How it works

| Area | Where |
|---|---|
| Express app; serves the built web app in production | `server/src/index.ts` |
| API endpoints (one handler file per path, web-standard `Request`/`Response`) | `server/src/routes/**/route.ts`, mounted in `server/src/api.ts` |
| Page data for the web app (one GET per screen; 401 / 402 / 404 handled) | `server/src/pages/*`, mounted at `/api/page/*` by `server/src/page-routes.ts` |
| Request context (cookies, headers, background work) | `server/src/http/{context,adapter,after}.ts` |
| Link parsing (YouTube / Vimeo / .mp4 / .webm) | `shared/src/video-source.ts` |
| Metadata from the link (title, length, description) | `server/src/lib/video/pipeline.ts` → `resolveMetadata` |
| Captions, multi-strategy | `server/src/lib/captions/*`, orchestrated by `pullCaptions` |
| AI fetch-agent fallback (Claude `web_fetch`) | `server/src/lib/ai/agent-fetch.ts` |
| AI auto-clipper (structured output, segment indices → real timestamps) | `server/src/lib/ai/clipper.ts` |
| Social providers | `server/src/lib/social/{youtube,meta,sandbox}.ts` |
| Publisher, 15-minute scheduler, stats refresh | `server/src/lib/social/publisher.ts`, `server/src/scheduler.ts`, `/api/cron/publish` |
| Plans and limits | `shared/src/plans.ts`, `server/src/lib/usage.ts` |
| Stripe checkout / portal / webhook | `server/src/routes/billing/*`, `server/src/routes/stripe/webhook` |
| Web app screens and routing | `web/src/pages/*`, `web/src/App.tsx` |
| Landing page and pre-rendering | `landing/src/Landing.tsx`, `landing/prerender.mjs` |

The web app's screens are typed against the server's loaders (`import type { … } from "@server/page-routes"`), so changing what a loader returns shows up as a type error in the screen that uses it.

**Caption order:** YouTube watch-page tracks → InnerTube player API → each track as json3, srv3, then VTT → YouTube translation (`tlang=en`) → Vimeo text tracks → `.vtt`/`.srt` next to a direct file → AI fetch agent → paste a transcript. Every video records its source and whether timings are **exact** or **estimated**, and the UI shows that plainly.

> YouTube increasingly gates caption downloads (bot checks and PO tokens), especially from datacenter IPs. When the server-side strategies are blocked, the AI fetch agent and the paste-transcript fallback keep the flow working.

## AI focus, posting copy and downloads

- **Focus**: when importing or re-running, choose what the AI looks for: Best moments, **Main events** (turning points, big plays, peak reactions in streams), Funniest, or Insights. Stored per video (`analysisFocus`).
- **AI posting copy** (1 credit, refunded on failure): on any clip, *Suggest* writes an improved title, hook, caption and hashtags, plus post text for YouTube (title + description), Instagram and Facebook. Nothing changes until the user clicks **Use** / **Use all** (then Save) or **Approve for posting** (pre-fills the post panel; the timestamp link is appended automatically). `server/src/lib/ai/suggest.ts`.
- **Download clip** (`/api/clips/:id/download?format=original|vertical`): ffmpeg cuts the range straight from the source URL (HTTP range reads, nothing stored), re-encodes for frame-accurate cuts and streams an MP4; *vertical* centre-crops to 1080×1920. Only for direct-file sources: YouTube and Vimeo don't permit downloading their videos. Uses `ffmpeg-static` (its install script is approved in the root `package.json` → `allowScripts`, along with Prisma's and esbuild's); set `FFMPEG_PATH` to use a system ffmpeg instead. Only network protocols are allowed as input.

## Billing (credits + Stripe)

Users pay for the video they process. **1 credit = 1 minute of video analysed** (rounded up); re-running a video costs a quarter, and failed analyses are refunded automatically. Posting and scheduling are free. All numbers live in `shared/src/plans.ts`, used by the API, the web app and the landing page.

- **Free trial**: 60 credits for 14 days on signup, no card (`TRIAL`).
- **Monthly plans** (`PLANS`): Creator $19 / 300 credits, Pro $49 / 1,000, Studio $129 / 3,000. Credits are granted on each paid invoice (`subscription_create`, `subscription_cycle`) and expire at period end.
- **Credit packs** (`CREDIT_PACKS`): 100 / $9, 500 / $39, 2,000 / $129. One-off Checkout payments priced inline, so no Stripe products are needed. They never expire.
- Ledger: `CreditGrant` (balances by source and expiry) and `CreditTransaction` (history). Spending draws from the soonest-expiring grant first, with conditional updates so a balance can't go negative.

Stripe setup:
1. Create three **monthly recurring** prices for the plans and set `STRIPE_PRICE_*`.
2. Add a webhook endpoint at `{APP_URL}/api/stripe/webhook` for these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
   - `invoice.paid`, `invoice.payment_failed`
3. Enable the **Customer Portal** (plan switching, cancellation, payment methods).

## Social apps

Every provider's redirect URI is `{APP_URL}/api/social/callback/{platform}`.

| Platform | App | What gets posted |
|---|---|---|
| Facebook | Meta app, Facebook Login: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `read_insights` | Page post with link preview |
| Instagram | Same Meta app: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` | Thumbnail image + caption (Business/Creator accounts) |
| YouTube | Google Cloud OAuth client (Web), YouTube Data API v3, scope `…/auth/youtube` | The creator's exported clip file, uploaded in chunks through the server (nothing stored); scheduling uses YouTube `publishAt` |

Admins can enter all of these in the app at **Admin → Integrations**, which also shows the exact redirect URIs to register. Customers then connect with a one-click sign-in popup.

> Google: until your project passes verification and the YouTube API audit, videos uploaded through it are locked to private.

## Deploying

`npm run build` produces three things to deploy:

1. **API + web app** (for example `app.shortlark.com`): any Node 20+ host (VPS, Docker, Render, Railway, Fly). Run `npm run build`, then `npm start`, which serves the API and `web/dist` on `PORT`. Set `APP_URL` to this origin, and `TRUST_PROXY=true` behind a load balancer. The publisher runs in-process every 15 minutes; with several instances, set `INTERNAL_SCHEDULER=false` on all but one, or call `/api/cron/publish` with `Authorization: Bearer $CRON_SECRET` from an external cron.
2. **Landing page** (for example `shortlark.com`): upload `landing/dist` to any static host or CDN (Vercel, Netlify, Cloudflare Pages, S3). Build it with `VITE_APP_URL` and `VITE_API_URL` set to the app origin, and set `LANDING_URL` on the API to the landing origin.
3. **Database**: switch `provider` to `postgresql` in `server/prisma/schema.prisma` and run `npm run db:push` (or migrations). On Postgres, add `mode: "insensitive"` to the `contains` filters in `server/src/lib/clips.ts` for case-insensitive library search.

The rate limiter in `server/src/lib/ratelimit.ts` is in-memory. Put a shared store (Redis/Upstash) behind it if you run several instances.

## Scripts

From the repository root:

| Script | What it does |
|---|---|
| `npm run dev` | API, web app and landing together (or `dev:server`, `dev:web`, `dev:landing`) |
| `npm run build` | Bundles the API (esbuild), builds the web app, builds and pre-renders the landing page |
| `npm start` | Runs the built API, which also serves the built web app |
| `npm run typecheck` | Type-checks all three |
| `npm run db:push` / `npm run db:studio` | Prisma schema sync / database browser |
