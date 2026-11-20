import { redirect } from "next/navigation";
import { edition } from "../lib/edition";
import { AgentRotator } from "../components/AgentRotator";
import { SITE_LINKS, SiteFooter, SiteHeader } from "../components/SiteChrome";
import { REPLAYS } from "../lib/demo-replays";
import { pageMeta, SITE_URL } from "../lib/seo";

const DESCRIPTION =
  "Talk to your Dokploy. Tell Claude, ChatGPT or Grok what you want and it deploys, reads logs and fixes your apps. Your secrets stay hidden from the AI, it can't delete unless you allow it, and every call is logged.";

export const metadata = pageMeta({
  title: "Zeqqat: the MCP gateway for Dokploy",
  absolute: true,
  description: DESCRIPTION,
  path: "/",
});

// What Zeqqat is, in the form search engines read: a free, open source
// developer tool, and who publishes it.
const JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Zeqqat",
    url: SITE_URL,
    description: DESCRIPTION,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    codeRepository: "https://github.com/zeqqat/zeqqat",
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Zeqqat",
    url: SITE_URL,
    logo: `${SITE_URL}/apple-icon.png`,
    sameAs: ["https://github.com/zeqqat/zeqqat"],
  },
];

// Each line must stay true for every new user by default (delete is off
// until the owner allows it).
const PROOF = [
  "Secrets stay hidden from the AI",
  "Can't delete unless you allow it",
  "Every call is logged",
];

export default function LandingPage() {
  // The landing page sells zeqqat.com. A self-hosted install opens straight
  // on sign-in, which takes signed-in people to their account page.
  if (edition() === "self-hosted") redirect("/signin");

  return (
    <div className="zq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <SiteHeader />

      <div className="zq-mid">
        <main className="zq-in">
          <p className="zq-hero-label">The MCP gateway for Dokploy</p>
          <h1 className="zq-mark">
            Talk to your
            <br />
            <span className="zq-hero-brand">
              <span
                className="zq-mono-logo"
                style={{ maskImage: "url(/logos/dokploy.svg)", WebkitMaskImage: "url(/logos/dokploy.svg)" }}
                aria-hidden="true"
              />
              Dokploy
            </span>
            <span className="dot">.</span>
          </h1>
          <p className="zq-tagline">
            <AgentRotator /> It deploys, reads logs and fixes your apps.
          </p>

          <div className="zq-hero-cta">
            <a className="zq-hero-btn" href={SITE_LINKS.signup}>
              Connect your Dokploy <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="zq-hero-alt">
              Prefer your own server? <a href={SITE_LINKS.selfHost}>Self-host it</a>
            </p>
          </div>

          {/* What people actually ask, in their own words (from Dokploy's support
              forum). Each opens a replay of the answer (/demo/<slug>). */}
          <p className="zq-hero-asks-label">See it in action. Tap a question.</p>
          <ul className="zq-hero-asks" aria-label="Things you can ask">
            {REPLAYS.map((r) => (
              <li key={r.slug}>
                <a href={`/demo/${r.slug}`}>
                  <span>{r.ask}</span>
                  <span className="zq-hero-ask-go">See the answer</span>
                </a>
              </li>
            ))}
          </ul>

          {/* After the demo: the three things that make it safe. */}
          <ul className="zq-hero-proof">
            {PROOF.map((line) => (
              <li key={line}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8.5l3.2 3.2L13 4.8" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
