"use client";

import { useState } from "react";
import { AGENTS, type AgentKey } from "../lib/agents";
import { AgentPanel } from "./AgentPanel";

export function AgentTabs({ mcpUrl }: { mcpUrl: string }) {
  const [active, setActive] = useState<AgentKey>("claude");

  return (
    <div>
      <div className="zq-tabbar" role="tablist" aria-label="Choose your agent">
        {AGENTS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={active === a.key}
            className={`zq-tab${active === a.key ? " is-active" : ""}`}
            onClick={() => setActive(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <AgentPanel agent={active} mcpUrl={mcpUrl} />
    </div>
  );
}
