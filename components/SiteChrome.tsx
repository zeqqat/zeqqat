import { getServerSession } from "../lib/session";
import { ThemeToggle } from "./ThemeToggle";

// Header and footer for zeqqat.com's public pages (landing, integrations).
// Every link here must resolve: add a page before linking to it.
export const SITE_LINKS = {
  signin: "/signin",
  signup: "/signup",
  app: "/app",
  integrations: "/integrations",
  github: "https://github.com/zeqqat/zeqqat",
  docs: "/docs/agents",
  selfHost: "/docs/self-host",
  blog: "/blog",
  terms: "/terms",
  privacy: "/privacy",
  // Permanent invite (never expires, no use limit) into #general of the
  // Zeqqat server. If it is ever revoked, set this back to "" to hide it:
  // an expired invite renders a Discord error page.
  discord: "https://discord.gg/rY6H8Rjcxp",
};

function Brand() {
  return (
    <a href="/" className="zq-brand" aria-label="Zeqqat home">
      <span className="zq-logo" aria-hidden="true">
        Z
      </span>
      <span className="zq-name">zeqqat</span>
    </a>
  );
}

// Signed-in visitors get "Dashboard" where others get "Sign in", so coming
// back to zeqqat.com is one click from their work.
// `current` is still accepted so /integrations renders, but the page is no longer linked.
export async function SiteHeader(_props: { current?: "integrations" } = {}) {
  const session = await getServerSession();
  return (
    <header className="zq-top">
      <div className="zq-top-left">
        <Brand />
        <nav className="zq-nav" aria-label="Site">
          <a href={SITE_LINKS.docs}>Docs</a>
          <a href={SITE_LINKS.blog}>Blog</a>
        </nav>
      </div>
      <div className="zq-top-right">
        {session?.user ? (
          <a href={SITE_LINKS.app} className="zq-link zq-link-strong">
            Dashboard
          </a>
        ) : (
          <a href={SITE_LINKS.signin} className="zq-link zq-link-strong">
            Sign in
          </a>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="zq-sitefoot">
      <div className="zq-sitefoot-grid">
        <div className="zq-sitefoot-brand">
          <span className="zq-brand">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <span className="zq-name">zeqqat</span>
          </span>
          <p>The open source, safe MCP for Dokploy.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <ul>
            <li><a href={SITE_LINKS.docs}>Docs</a></li>
            <li><a href={SITE_LINKS.selfHost}>Self-hosting</a></li>
            <li><a href={SITE_LINKS.blog}>Blog</a></li>
          </ul>
        </nav>
        <nav aria-label="Community">
          <h2>Community</h2>
          <ul>
            <li><a href={SITE_LINKS.github} rel="noreferrer noopener">GitHub</a></li>
            {SITE_LINKS.discord ? (
              <li><a href={SITE_LINKS.discord} rel="noreferrer noopener">Discord</a></li>
            ) : null}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <ul>
            <li><a href={SITE_LINKS.terms}>Terms</a></li>
            <li><a href={SITE_LINKS.privacy}>Privacy</a></li>
          </ul>
        </nav>
      </div>
      <div className="zq-sitefoot-base">
        <span>&copy; {new Date().getFullYear()} Zeqqat</span>
        <span>Free and open source</span>
      </div>
    </footer>
  );
}
