/**
 * Response shapes of the API's page-data endpoints (/api/page/*), as the web app receives them.
 * Dates are typed as Date here and arrive as ISO strings (wrap with Jsonify).
 * Keep in sync with backend/app/pages/*.py.
 */

export type { Jsonify } from "./json";
import type { SocialPlatform } from "./social";

export type IntegrationId = "meta" | "google";

export type MeData = {
  name: string;
  email: string;
  planName: string | null;
  credits: number;
  monthlyCredits: number | null;
  isAdmin: boolean;
};

export type VideosData = {
  videos: {
    id: string;
    createdAt: Date;
    platform: string;
    title: string;
    author: string | null;
    durationSec: number | null;
    thumbnailUrl: string | null;
    captionStatus: string;
    analysisStatus: string;
    analysisError: string | null;
    clips: { score: number | null }[];
    _count: { clips: number };
  }[];
  aiConfigured: boolean;
};

export type VideoData = {
  video: {
    clips: {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
      title: string;
      videoId: string;
      startSec: number;
      endSec: number;
      status: string;
      origin: string;
      category: string | null;
      score: number | null;
      scoreHook: number | null;
      scoreSelf: number | null;
      scorePayoff: number | null;
      scoreQuote: number | null;
      reason: string | null;
      hook: string;
      caption: string;
      hashtags: string;
      notes: string;
      transcript: string;
      suggestionsJson: string | null;
    }[];
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    sourceUrl: string;
    platform: string;
    externalId: string | null;
    title: string;
    description: string;
    author: string | null;
    durationSec: number | null;
    thumbnailUrl: string | null;
    captionStatus: string;
    captionSource: string | null;
    captionTiming: string | null;
    captionLanguage: string | null;
    captionNote: string | null;
    analysisStatus: string;
    analysisCount: number;
    analysisFocus: string;
    analysisError: string | null;
    analyzedAt: Date | null;
    summary: string | null;
  };
  segmentCount: number;
  duration: number;
  cost: number;
  balance: number;
  aiConfigured: boolean;
};

export type ClipData = {
  clip: {
    id: string;
    title: string;
    startSec: number;
    endSec: number;
    status: string;
    category: string | null;
    hook: string;
    caption: string;
    hashtags: string;
    notes: string;
    transcript: string;
    score: number | null;
    scoreHook: number | null;
    scoreSelf: number | null;
    scorePayoff: number | null;
    scoreQuote: number | null;
    reason: string | null;
    origin: string;
  };
  video: {
    id: string;
    title: string;
    platform: string;
    externalId: string | null;
    sourceUrl: string;
    durationSec: number | null;
    captionTiming: string | null;
  };
  siblings: { id: string; title: string; startSec: number; endSec: number; status: string }[];
  segments: { start: number; end: number; text: string }[];
  suggestion: unknown;
  canDownload: boolean;
  accounts: { id: string; platform: string; status: string; displayName: string; username: string | null }[];
  posts: {
    id: string;
    platform: string;
    accountName: string;
    status: string;
    text: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    liveUrl: string | null;
    error: string | null;
  }[];
};

export type MomentsData = {
  clips: ({ video: { id: string; title: string; thumbnailUrl: string | null } } & {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    title: string;
    videoId: string;
    startSec: number;
    endSec: number;
    status: string;
    origin: string;
    category: string | null;
    score: number | null;
    scoreHook: number | null;
    scoreSelf: number | null;
    scorePayoff: number | null;
    scoreQuote: number | null;
    reason: string | null;
    hook: string;
    caption: string;
    hashtags: string;
    notes: string;
    transcript: string;
    suggestionsJson: string | null;
  })[];
  total: number;
  page: number;
  min: number;
  unposted: boolean;
  pageSize: number;
};

export type LibraryData = {
  total: number;
  limit: number;
  rows: {
    id: string;
    title: string;
    status: string;
    score: number | null;
    category: string | null;
    startSec: number;
    endSec: number;
    videoTitle: string;
    source: string;
    updatedAt: string;
    posts: number;
  }[];
};

export type QueueData = {
  history: boolean;
  posts: {
    error: string | null;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    platform: string;
    clip: { id: string; video: { title: string }; title: string };
    status: string;
    accountName: string;
    text: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    liveUrl: string | null;
  }[];
};

export type AnalyticsData = {
  range: string;
  totals: { posts: number; views: number; likes: number; comments: number; shares: number };
  engagement: number | null;
  byPlatform: { platform: string; posts: number; views: number; likes: number; comments: number; shares: number }[];
  top: {
    id: string;
    platform: string;
    accountName: string;
    publishedAt: Date | null;
    liveUrl: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    clip: { id: string; title: string };
  }[];
  lastUpdate: Date | null;
  failedCount: number;
  scheduledCount: number;
};

export type AccountsData = {
  accounts: {
    id: string;
    platform: string;
    status: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  }[];
  platforms: {
    id: SocialPlatform;
    configured: boolean;
    integrationId: IntegrationId | null;
    integrationName: string | null;
  }[];
  connectedCount: number;
  accountLimit: number;
  isAdmin: boolean;
};

export type BillingData = {
  readonly tab: "plan" | "history";
  readonly mode: "stripe" | "dev" | "unavailable";
  readonly active: boolean;
  readonly plan: string;
  readonly subscriptionStatus: string;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly hasStripeCustomer: boolean;
  readonly credits: {
    readonly total: number;
    readonly bySource: Record<string, { remaining: number; expiresAt: Date | null }>;
  };
  readonly history: {
    rows: { id: string; createdAt: Date; description: string; kind: string; delta: number; refundedAt: Date | null }[];
    added: number;
    used: number;
    count: number;
  } | null;
};

export type LeadsData = {
  leads: {
    id: string;
    email: string;
    createdAt: Date;
    source: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
  }[];
  total: number;
  converted: number;
};

export type IntegrationsData = {
  integrations: {
    id: IntegrationId;
    name: string;
    platforms: string[];
    steps: string[];
    consoleUrl: string;
    idLabel: string;
    secretLabel: string;
    secretOptional: boolean | undefined;
    live: boolean;
    redirectUris: string[];
    savedClientId: string;
    hasSavedSecret: boolean;
    source: "app" | "env" | "none";
  }[];
};
