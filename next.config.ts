import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev-tools badge; pages show their own centered loader instead.
  devIndicators: false,
  poweredByHeader: false,
  // ffmpeg-static resolves its binary next to its own file; keep it out of the server bundle.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
