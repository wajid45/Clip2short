import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { getThemeChoice } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Shortlark · Turn long streams into Shorts and Reels", template: "%s · Shortlark" },
  description:
    "Paste a stream or video link. Shortlark's AI finds the moments worth clipping, scores them, writes hooks and captions, and posts them to YouTube Shorts, Instagram and Facebook.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  openGraph: { type: "website", siteName: "Shortlark" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0d" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getThemeChoice();
  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} antialiased`}>{children}</body>
    </html>
  );
}
