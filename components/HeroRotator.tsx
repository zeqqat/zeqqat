"use client";

import { AgentSlot, type Agent } from "./AgentRotator";

/**
 * The rotating word in the landing headline: "Give AI access to your APIs"
 * turning to "MCPs" and back, the same flip as the agent row in the tagline.
 * Just the two words, no logos: app logos get their own place on the page.
 */
const TARGETS: Agent[] = [
  { name: "APIs", mono: true },
  { name: "MCPs", mono: true },
];

export function HeroRotator() {
  return (
    <span className="zq-hero-rot">
      <AgentSlot agents={TARGETS} suffix="." waitMs={2400} />
    </span>
  );
}
