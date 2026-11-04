export type AgentKey = "claude" | "claudecode" | "cursor" | "chatgpt" | "vscode" | "other";

// The hints are load-bearing (spec section 6): the options aren't
// equivalent, so each one says exactly what's different about it.
export const AGENTS: { key: AgentKey; label: string; hint: string }[] = [
  { key: "claude", label: "Claude", hint: "Web, desktop and mobile app" },
  { key: "claudecode", label: "Claude Code", hint: "Terminal, VS Code, JetBrains" },
  { key: "cursor", label: "Cursor", hint: "Editor, Agent mode" },
  { key: "chatgpt", label: "ChatGPT", hint: "Needs a paid plan" },
  { key: "vscode", label: "VS Code", hint: "Copilot Agent mode" },
  { key: "other", label: "Other", hint: "Any MCP client" },
];
