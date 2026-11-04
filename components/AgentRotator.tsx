"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The row of agent names in the landing tagline ("Claude, ChatGPT, Grok or any
 * MCP client"). Each slot flips through its own list like a drum turning
 * toward the reader.
 *
 * Rules, all deliberate:
 * - Each slot owns its own list, so one agent can never show in two slots at
 *   once, and a slot always moves to the next name in its own list, so it
 *   never repeats itself back to back.
 * - Each slot waits its own random 3 to 8 seconds, so they never turn together.
 * - The row sits on its own line (see `.zq-agents`), so a slot changing width
 *   only re-centres that line and never rewraps the rest of the paragraph.
 * - First render is always index 0 in every slot, so server and client markup
 *   match; randomness only starts in effects.
 *
 * `mono: true` means a single-colour mark. It is drawn as a CSS mask filled
 * with the text colour, so it stays visible in both themes. Coloured marks
 * render as plain images. Logo files live in `public/logos/`.
 */
type Agent = { name: string; logo?: string; mono: boolean };

const AGENT_SLOTS: Agent[][] = [
  [
    { name: "Claude", logo: "/logos/claude.svg", mono: false },
    { name: "Gemini", logo: "/logos/gemini.svg", mono: false },
    { name: "Copilot", logo: "/logos/copilot.svg", mono: true },
  ],
  [
    { name: "ChatGPT", logo: "/logos/chatgpt.svg", mono: true },
    { name: "DeepSeek", logo: "/logos/deepseek.svg", mono: false },
    { name: "Cursor", logo: "/logos/cursor.svg", mono: true },
  ],
  // Short names share the last slot.
  [
    { name: "Grok", logo: "/logos/grok.svg", mono: true },
    { name: "Muse", logo: "/logos/muse.png", mono: false },
    { name: "Dots", logo: "/logos/dots.png", mono: true },
  ],
];

function AgentMark({ agent }: { agent: Agent }) {
  if (!agent.logo) return null;
  return agent.mono ? (
    <span
      className="zq-mono-logo"
      style={{ maskImage: `url(${agent.logo})`, WebkitMaskImage: `url(${agent.logo})` }}
      aria-hidden="true"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- 16px inline marks, next/image adds nothing here
    <img src={agent.logo} alt="" aria-hidden="true" />
  );
}

function AgentLabel({ agent, suffix }: { agent: Agent; suffix?: string }) {
  return (
    <>
      <AgentMark agent={agent} />
      <b>{agent.name}</b>
      {suffix ? <span className="zq-slot-x">{suffix}</span> : null}
    </>
  );
}

/**
 * The slot's width follows the name currently showing and eases between
 * names, so a short name never leaves a gap before the next comma. Old and new
 * names share one grid cell while they flip, so they stay lined up.
 */
function AgentSlot({ agents, suffix }: { agents: Agent[]; suffix?: string }) {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const inRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (agents.length < 2) return;
    const wait = 3000 + Math.random() * 5000;
    const t = setTimeout(() => {
      setPrev(idx);
      setIdx((idx + 1) % agents.length);
    }, wait);
    return () => clearTimeout(t);
  }, [idx, agents.length]);

  useEffect(() => {
    if (inRef.current) setWidth(inRef.current.offsetWidth);
  }, [idx]);

  return (
    <span className="zq-slot" style={{ width }}>
      {prev !== null ? (
        <span key={`out-${prev}-${idx}`} className="zq-slot-item zq-slot-out" aria-hidden="true">
          <AgentLabel agent={agents[prev]} suffix={suffix} />
        </span>
      ) : null}
      <span
        key={`in-${idx}`}
        ref={inRef}
        className={`zq-slot-item${prev !== null ? " zq-slot-in" : ""}`}
      >
        <AgentLabel agent={agents[idx]} suffix={suffix} />
      </span>
    </span>
  );
}

export function AgentRotator() {
  return (
    <span className="zq-agents">
      <span className="zq-agent-names">
        <AgentSlot agents={AGENT_SLOTS[0]} suffix="," />{" "}
        <AgentSlot agents={AGENT_SLOTS[1]} suffix="," />{" "}
        <AgentSlot agents={AGENT_SLOTS[2]} />
      </span>
      <span className="zq-agents-rest"> or any MCP client.</span>
    </span>
  );
}
