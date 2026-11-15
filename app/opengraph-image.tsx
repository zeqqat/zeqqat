import { ogImage, OG_SIZE } from "../lib/og-image";

export const alt = "Zeqqat: the MCP gateway for Dokploy";
export const size = OG_SIZE;
export const contentType = "image/png";

// The card shown when zeqqat.com is pasted into Discord, X, Slack or LinkedIn.
export default function Image() {
  return ogImage({ label: "The MCP gateway for Dokploy", title: "Talk to your Dokploy." });
}
