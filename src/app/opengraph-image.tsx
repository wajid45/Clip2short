import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Shortlark: find the Shorts and Reels hiding in your long videos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card, generated at build time. */
export default async function OpengraphImage() {
  const mark = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/brand/logo-mark.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0c0d", color: "#fff", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mark} width={64} height={64} alt="" />
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>shortlark</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5 }}>Your long videos already</span>
            <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5 }}>
              have the clips.&nbsp;<span style={{ color: "#FF5B23" }}>We find them.</span>
            </span>
          </div>
          <span style={{ fontSize: 28, color: "#9a9aa3" }}>AI-scored moments · hooks & captions · post to YouTube Shorts, Instagram Reels, Facebook</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginLeft: 40 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 150,
                height: 266,
                borderRadius: 22,
                marginLeft: i ? -60 : 0,
                transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -20 : 10}px)`,
                background: i === 1 ? "linear-gradient(160deg,#FF7A3D,#F2381B)" : "#1b1b1f",
                border: "2px solid #36363d",
                display: "flex",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
