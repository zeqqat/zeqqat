"use client";

import { useState } from "react";
import { AGENTS, claudeInstallLink, cursorInstallLink, type AgentKey } from "../lib/agents";
import { AgentPanel } from "./AgentPanel";

// One button per agent, like "Continue with Google". Claude and Cursor have
// install links that open the app with Zeqqat filled in; the rest open a
// short copy-and-paste panel under their button.
export function AgentPicker({ mcpUrl }: { mcpUrl: string }) {
  const [open, setOpen] = useState<AgentKey | null>(null);
  const links: Partial<Record<AgentKey, string>> = {
    claude: claudeInstallLink(mcpUrl),
    cursor: cursorInstallLink(mcpUrl),
  };

  return (
    <div className="zq-agents">
      {AGENTS.map((a) => {
        const href = links[a.key];
        const isOpen = open === a.key;
        const inner = (
          <>
            <AgentLogo logo={a.logo} mono={a.mono} />
            <span className="zq-agent-label">{a.label}</span>
            <span className="zq-agent-go" aria-hidden="true">
              {href ? "\u2197" : "\u2304"}
            </span>
          </>
        );
        return (
          <div key={a.key}>
            {href ? (
              <a
                className={`zq-agent-btn${isOpen ? " is-open" : ""}`}
                href={href}
                target={a.key === "claude" ? "_blank" : undefined}
                rel="noreferrer"
                onClick={() => setOpen(a.key)}
              >
                {inner}
              </a>
            ) : (
              <button
                type="button"
                className={`zq-agent-btn${isOpen ? " is-open" : ""}`}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : a.key)}
              >
                {inner}
              </button>
            )}
            {isOpen && (
              <div className="zq-agent-more">
                <AgentPanel agent={a.key} mcpUrl={mcpUrl} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentLogo({ logo, mono }: { logo: string | null; mono: boolean }) {
  if (!logo)
    return (
      <span className="zq-agent-logo is-plus" aria-hidden="true">
        +
      </span>
    );
  if (!mono)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="zq-agent-logo" src={logo} alt="" aria-hidden="true" />;
  return (
    <span
      className="zq-agent-logo is-mono"
      style={{ WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})` }}
      aria-hidden="true"
    />
  );
}
