// Brand marks. Single-colour logos are drawn as a mask filled with the text
// colour so they work in both themes; Claude's mark keeps its own colour.
// Unknown agents get the first letter of their host.

export function DokployMark({ size = 16 }: { size?: number }) {
  return (
    <span
      className="zq-mono-logo zq-mark-ic zq-mark-dokploy"
      style={{ width: size, height: size * 0.92 }}
      aria-hidden="true"
    />
  );
}

// Mark for an integration by its slug. Integrations without a drawn logo
// get the first letter of their name, like unknown agents.
export function IntegrationMark({
  slug,
  name,
  size = 16,
  logo,
}: {
  slug: string;
  name: string;
  size?: number;
  // An imported app's logo (from its spec or its docs site's favicon).
  logo?: string | null;
}) {
  if (slug === "dokploy") return <DokployMark size={size} />;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- remote favicon, tiny
    return <img src={logo} alt="" aria-hidden="true" width={size} height={size} style={{ borderRadius: 3, objectFit: "contain" }} />;
  }
  return (
    <span aria-hidden="true" style={{ fontSize: Math.round(size * 0.8), fontWeight: 600, lineHeight: 1 }}>
      {(name.charAt(0) || "?").toUpperCase()}
    </span>
  );
}

const AGENT_LOGOS:{ match: RegExp; src: string; mono: boolean; name: string }[] = [
  { match: /(^|\.)claude\.(ai|com)$|(^|\.)anthropic\.com$/, src: "/logos/claude.svg", mono: false, name: "Claude" },
  { match: /(^|\.)(chatgpt|openai)\.com$/, src: "/logos/chatgpt.svg", mono: true, name: "ChatGPT" },
  { match: /(^|\.)cursor\.(com|sh)$/, src: "/logos/cursor.svg", mono: true, name: "Cursor" },
  { match: /(^|\.)github\.com$/, src: "/logos/copilot.svg", mono: true, name: "GitHub Copilot" },
  { match: /(^|\.)google\.com$/, src: "/logos/gemini.svg", mono: false, name: "Gemini" },
];

// Friendly name for a client we recognise by its verified host. Anything
// we don't recognise shows its host, which is the part CIMD proves.
export function agentName(host: string): string {
  return AGENT_LOGOS.find((l) => l.match.test(host))?.name ?? host;
}

export function AgentMark({ host, size = 16 }: { host: string; size?: number }) {
  const hit = AGENT_LOGOS.find((l) => l.match.test(host));
  if (!hit) {
    return (
      <span aria-hidden="true" style={{ fontSize: Math.round(size * 0.8), fontWeight: 600, lineHeight: 1 }}>
        {(host.charAt(0) || "?").toUpperCase()}
      </span>
    );
  }
  if (hit.mono) {
    return (
      <span
        className="zq-mono-logo zq-mark-ic"
        style={{ width: size, height: size, maskImage: `url(${hit.src})`, WebkitMaskImage: `url(${hit.src})` }}
        aria-hidden="true"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={hit.src} alt="" width={size} height={size} style={{ display: "block" }} />;
}
