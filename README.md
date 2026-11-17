# Shortlark

Shortlark turns long videos into short clips that are ready to post. Paste a YouTube or direct video link, and the AI finds the best moments and cuts them into vertical Shorts and Reels with captions. It also writes the title, caption and hashtags for each clip. You review and fine-tune clips in the editor, then post on social media or schedule it.

Clips can also be downloaded as vertical MP4s.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Prisma (SQLite locally, Postgres in production) · Stripe subscriptions · Claude API (`claude-opus-5-5`).

## Quick start (local)

```bash
npm install
cp .env.example .env        # then fill in what you have
npx prisma db push          # creates prisma/dev.db
npm run dev                 # http://localhost:3000
```

With no keys set, local development still works end to end:

- **Billing**: plans activate instantly from the Billing page (dev mode, disabled in production and whenever Stripe keys exist).
- **Social**: a *Sandbox* account simulates publishing. Put `#fail` in a post to test failure handling.
- **AI**: imports and captions work. Moment-finding needs `ANTHROPIC_API_KEY`.

## Environment

See `.env.example` for every variable. Required in production: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, and the Stripe variables.

## How it works

| Area | Where |
|---|---|
| Link parsing (YouTube / Vimeo / .mp4 / .webm) | `src/lib/video/source.ts` |
| Metadata from the link (title, length, description) | `src/lib/video/pipeline.ts` → `resolveMetadata` |
| Captions, multi-strategy | `src/lib/captions/*`, orchestrated by `pullCaptions` |
| AI fetch-agent fallback (Claude `web_fetch`) | `src/lib/ai/agent-fetch.ts` |
| AI auto-clipper (structured output, segment indices → real timestamps) | `src/lib/ai/clipper.ts` |
| Social providers | `src/lib/social/{youtube,meta,sandbox}.ts` |
| Publisher + 15-minute scheduler + stats refresh | `src/lib/social/publisher.ts`, `/api/cron/publish` |
| Plans and limits | `src/lib/plans.ts`, `src/lib/usage.ts` |
| Stripe checkout / portal / webhook | `src/app/api/billing/*`, `src/app/api/stripe/webhook` |

**Caption order:** YouTube watch-page tracks → InnerTube player API → each track as json3, srv3, then VTT → YouTube translation (`tlang=en`) → Vimeo text tracks → `.vtt`/`.srt` next to a direct file → AI fetch agent → paste a transcript. Every video records its source and whether timings are **exact** or **estimated**, and the UI shows that plainly.

> YouTube increasingly gates caption downloads (bot checks and PO tokens), especially from datacenter IPs. When the server-side strategies are blocked, the AI fetch agent and the paste-transcript fallback keep the flow working.

## AI focus, posting copy and downloads

- **Focus**: when importing or re-running, choose what the AI looks for: Best moments, **Main events** (turning points, big plays, peak reactions in streams), Funniest, or Insights. Stored per video (`analysisFocus`).
- **AI posting copy** (1 credit, refunded on failure): on any clip, *Suggest* writes an improved title, hook, caption and hashtags, plus post text for YouTube (title + description), Instagram and Facebook. Nothing changes until the user clicks **Use** / **Use all** (then Save) or **Approve for posting** (pre-fills the post panel; the timestamp link is appended automatically). `src/lib/ai/suggest.ts`.
- **Download clip** (`/api/clips/[id]/download?format=original|vertical`): ffmpeg cuts the range straight from the source URL (HTTP range reads, nothing stored), re-encodes for frame-accurate cuts and streams an MP4; *vertical* centre-crops to 1080×1920. Only for direct-file sources: YouTube and Vimeo don't permit downloading their videos. Uses `ffmpeg-static` (its install script is approved in `package.json` → `allowScripts`); set `FFMPEG_PATH` to use a system ffmpeg instead. Only network protocols are allowed as input.

## Billing (credits + Stripe)

Users pay for the video they process. **1 credit = 1 minute of video analysed** (rounded up); re-running a video costs a quarter, and failed analyses are refunded automatically. Posting and scheduling are free. All numbers live in `src/lib/plans.ts`.

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

- **Vercel**: `vercel.json` calls `/api/cron/publish` every 15 minutes, and Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
- **Single Node server (Docker/VPS)**: set `INTERNAL_SCHEDULER=true` to run the publisher in-process, or call the cron URL from any external scheduler.
- **Database**: switch `provider` to `postgresql` in `prisma/schema.prisma` and run `npx prisma db push` (or migrations). On Postgres, add `mode: "insensitive"` to the `contains` filters in `src/lib/clips.ts` for case-insensitive library search.
- The rate limiter in `src/lib/ratelimit.ts` is in-memory. Put a shared store (Redis/Upstash) behind it if you run several instances.

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run db:push` · `npm run db:studio`
