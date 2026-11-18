export type SocialPlatform = "youtube" | "instagram" | "facebook" | "sandbox";

export interface PlatformInfo {
  id: SocialPlatform;
  label: string;
  /** Max characters for the post text. */
  maxChars: number;
  /** URLs count as this many characters (X wraps links in t.co). */
  urlLength?: number;
  /** What actually gets published, shown in the UI so users know exactly what to expect. */
  format: string;
  needsImage: boolean;
}

export const PLATFORMS: Record<SocialPlatform, PlatformInfo> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    maxChars: 5000,
    format: "Uploads your clip file. Vertical videos up to 3 minutes appear as Shorts; others as regular videos.",
    needsImage: false,
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    maxChars: 2200,
    format: "Image post: the video thumbnail with your caption. Instagram links aren't clickable, so the timestamp link is added as text.",
    needsImage: true,
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    maxChars: 5000,
    format: "Page post with a link preview that opens the video at the clip's timestamp.",
    needsImage: false,
  },
  sandbox: {
    id: "sandbox",
    label: "Sandbox",
    maxChars: 5000,
    format: "Development only. Simulates publishing so you can test the flow without a real account.",
    needsImage: false,
  },
};

/** Length as counted by the platform (X counts every URL as 23 characters). */
export function platformLength(platform: SocialPlatform, text: string): number {
  const info = PLATFORMS[platform];
  if (!info.urlLength) return [...text].length;
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  let len = [...text].length;
  for (const u of urls) len = len - [...u].length + info.urlLength;
  return len;
}

export interface ConnectedAccountInput {
  externalId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  meta?: Record<string, unknown>;
}

export interface PublishInput {
  text: string;
  link: string;
  imageUrl: string | null;
  title: string;
}

export interface PublishResult {
  externalId: string;
  liveUrl: string | null;
  /** True when the platform is still processing; the cron job confirms it later. */
  pending?: boolean;
}

export interface PostStats {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

export interface AccountContext {
  id: string;
  externalId: string;
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  meta: Record<string, unknown>;
}

export class PublishError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

export interface SocialProvider {
  id: SocialPlatform;
  configured(): boolean;
  /** Env vars needed, shown to admins when not configured. */
  requiredEnv: string[];
  usesPkce?: boolean;
  authorizeUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchange(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<ConnectedAccountInput[]>;
  refresh?(acc: AccountContext): Promise<{ accessToken: string; refreshToken?: string | null; tokenExpiresAt?: Date | null } | null>;
  publish(acc: AccountContext, input: PublishInput): Promise<PublishResult>;
  checkPending?(acc: AccountContext, externalId: string): Promise<PublishResult | { failed: string } | null>;
  stats?(acc: AccountContext, externalId: string): Promise<PostStats | null>;
}
