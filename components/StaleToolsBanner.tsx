"use client";

import { useState } from "react";
import type { StaleEntry } from "../lib/tools-changed";

// Shown on every page to someone whose agent is working from an old Zeqqat
// tool list (lib/tools-changed.ts): only they can fix it, by reconnecting
// Zeqqat in that agent. Reconnecting is per MCP URL, so a click lists which
// agent on which MCP URL. It goes away once the agent fetches the new list.
export function StaleToolsBanner({ entries }: { entries: StaleEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  const many = entries.length > 1;
  return (
    <div className="zq-https zq-stale-tools" role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
        <path d="M4 4v4h4" />
        <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
        <path d="M20 20v-4h-4" />
      </svg>
      <div className="zq-stale-body">
        <p>
          Your {many ? "agents have" : "agent has"} an old Zeqqat tool list. Reconnect Zeqqat to get the new tools.{" "}
          <button type="button" className="zq-stale-which" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : many ? "Which ones" : "Which one"}
          </button>
        </p>
        {open && (
          <ul className="zq-stale-list">
            {entries.map((e) => (
              <li key={`${e.agent}:${e.account}:${e.mcpUrl}`}>
                <b>{e.agent}</b> on{" "}
                <a className="zq-textlink" href={`/${e.account}/${e.workspace}/mcp-urls`}>
                  {e.mcpUrl}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
