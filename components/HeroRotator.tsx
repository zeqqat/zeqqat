"use client";

import { AgentSlot, type Agent } from "./AgentRotator";

/**
 * The rotating line in the landing headline: "Give AI access to your
 * [Stripe API]". It turns like the agent row in the tagline, because the
 * point is the same: Zeqqat sits between any agent and any API or MCP.
 *
 * Every mark is a single-colour logo (simple-icons, CC0) drawn as a mask, so
 * it follows the text colour in both themes. Names stay short so the line
 * never wraps at the largest headline size.
 */
const TARGETS: Agent[] = [
  { name: "Dokploy API", logo: "/logos/dokploy.svg", mono: true },
  { name: "GitHub MCP", logo: "/logos/github.svg", mono: true },
  { name: "Stripe API", logo: "/logos/stripe.svg", mono: true },
  { name: "Supabase MCP", logo: "/logos/supabase.svg", mono: true },
  { name: "Coolify API", logo: "/logos/coolify.svg", mono: true },
  { name: "Linear MCP", logo: "/logos/linear.svg", mono: true },
  { name: "Cloudflare API", logo: "/logos/cloudflare.svg", mono: true },
  { name: "Notion MCP", logo: "/logos/notion.svg", mono: true },
  { name: "Shopify API", logo: "/logos/shopify.svg", mono: true },
  { name: "Sentry MCP", logo: "/logos/sentry.svg", mono: true },
];

export function HeroRotator() {
  return (
    <span className="zq-hero-rot">
      <AgentSlot agents={TARGETS} suffix="." waitMs={2400} />
    </span>
  );
}
