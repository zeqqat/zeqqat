export type AgentKey = "claude" | "claudecode" | "chatgpt" | "cursor" | "grok" | "muse" | "other";

// Order is deliberate: Claude, Claude Code, ChatGPT, Cursor, Grok, Muse.
// VS Code is left out on purpose (few people use it as their agent now);
// "Another MCP client" covers it.
export const AGENTS: {
  key: AgentKey;
  label: string;
  logo: string | null;
  mono: boolean;
}[] = [
  {
    key: "claude",
    label: "Add to Claude",
    logo: "/logos/claude.svg",
    mono: false,
  },
  {
    key: "claudecode",
    label: "Claude Code",
    logo: "/logos/claude.svg",
    mono: false,
  },
  { key: "chatgpt", label: "ChatGPT", logo: "/logos/chatgpt.svg", mono: true },
  {
    key: "cursor",
    label: "Add to Cursor",
    logo: "/logos/cursor.svg",
    mono: true,
  },
  { key: "grok", label: "Grok", logo: "/logos/grok.svg", mono: true },
  { key: "muse", label: "Muse", logo: "/logos/muse.png", mono: false },
  { key: "other", label: "Another MCP client", logo: null, mono: true },
];

// Install links. Only the ones the vendor documents:
//   Claude  https://claude.com/docs/connectors/building/directory-vs-custom
//   Cursor  https://cursor.com/docs/mcp/install-links
// ChatGPT, Grok and Muse have no link that fills in a server URL (checked
// 2026-11-12), so those stay copy and paste.
export function claudeInstallLink(mcpUrl: string, admin = false): string {
  const base = admin ? "https://claude.ai/admin-settings/connectors" : "https://claude.ai/customize/connectors";
  return `${base}?modal=add-custom-connector&connectorName=Zeqqat&connectorUrl=${encodeURIComponent(mcpUrl)}`;
}

export function cursorInstallLink(mcpUrl: string): string {
  // btoa, not Buffer: this also runs in the browser. The JSON is plain ASCII.
  const config = btoa(JSON.stringify({ url: mcpUrl }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=zeqqat&config=${encodeURIComponent(config)}`;
}

export const CHATGPT_PLUGINS_URL = "https://chatgpt.com/plugins";

export const GROK_CONNECTORS_URL = "https://grok.com/connectors";
