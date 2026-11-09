import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Analytics } from "../components/analytics";
import "./globals.css";

// Fonts are bundled (app/fonts, SIL Open Font License), not fetched from
// Google at build time: that download failed often enough to break deploys
// of zeqqat.com, and a self-hoster's build shouldn't need Google either.
const display = localFont({
  src: [{ path: "./fonts/bricolage-grotesque-latin-800-normal.woff2", weight: "800", style: "normal" }],
  variable: "--font-display-src",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Zeqqat: the safe MCP for Dokploy",
    template: "%s | Zeqqat",
  },
  description:
    "Give AI access to your Dokploy, self-hosted or Cloud. Your agent deploys, reads logs and fixes your apps, you decide exactly what it may touch, and your API keys, env vars and secrets never reach the LLM.",
};

// Applied before first paint so a dark-mode reader never sees a white flash;
// a React effect runs after paint, which is exactly too late.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Analytics nonce={nonce} />
      </body>
    </html>
  );
}
