export type AgentKey = "claude" | "claudecode" | "chatgpt" | "cursor" | "vscode" | "other";

// Order is deliberate: Claude, Claude Code, ChatGPT, Cursor, then the rest.
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
  { key: "vscode", label: "VS Code", logo: "/logos/copilot.svg", mono: true },
  { key: "other", label: "Another MCP client", logo: null, mono: true },
];

// Install links. Only the ones the vendor documents:
//   Claude  https://claude.com/docs/connectors/building/directory-vs-custom
//   Cursor  https://cursor.com/docs/mcp/install-links
// ChatGPT and VS Code have no documented link that fills in a server URL
// (checked 2026-11-12), so those stay copy and paste.
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
