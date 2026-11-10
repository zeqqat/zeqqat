import { ogImage, OG_SIZE } from "../lib/og-image";

export const alt = "Zeqqat: the safe MCP for Dokploy";
export const size = OG_SIZE;
export const contentType = "image/png";

// The card shown when zeqqat.com is pasted into Discord, X, Slack or LinkedIn.
export default function Image() {
  return ogImage({ label: "The safe MCP for Dokploy", title: "Give AI access to your Dokploy. Minus the risk." });
}
