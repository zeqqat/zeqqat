import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// The image renderer reads WOFF, not WOFF2, so these two sit beside the
// WOFF2 files the pages use (same fonts, same license).
const font = (file: string) => fs.readFile(path.join(process.cwd(), "app", "fonts", file));

// One share card for every page: the Z mark, a small label, the page's
// title, and the address. Dark, like the site's dark theme.
export async function ogImage({ label, title }: { label: string; title: string }) {
  const [display, mono] = await Promise.all([
    font("bricolage-grotesque-latin-800-normal.woff"),
    font("ibm-plex-mono-latin-500-normal.woff"),
  ]);
  const size = title.length > 90 ? 52 : title.length > 60 ? 60 : title.length > 36 ? 70 : 84;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0c1116",
          color: "#f2f5f7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#5c9bff",
              color: "#0c1116",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Bricolage",
              fontSize: 40,
            }}
          >
            Z
          </div>
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 38 }}>zeqqat</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontFamily: "Plex", fontSize: 26, color: "#5c9bff" }}>{label}</div>
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: size, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
            {title}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Plex", fontSize: 24, color: "#7b8c99" }}>
          <div style={{ display: "flex" }}>zeqqat.com</div>
          <div style={{ display: "flex" }}>Free and open source</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Bricolage", data: display, weight: 800, style: "normal" },
        { name: "Plex", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
