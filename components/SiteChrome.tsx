import { getServerSession } from "../lib/session";
import { SOCIAL_LINKS } from "../lib/social-links";
import { ThemeToggle } from "./ThemeToggle";

// Header and footer for zeqqat.com's public pages (landing, releases).
// Every link here must resolve: add a page before linking to it.
export const SITE_LINKS = {
  signin: "/signin",
  signup: "/signup",
  app: "/app",
  github: SOCIAL_LINKS.github,
  docs: "/docs/agents",
  selfHost: "/docs/self-host",
  blog: "/blog",
  releases: "/releases",
  terms: "/terms",
  privacy: "/privacy",
  discord: SOCIAL_LINKS.discord,
  x: SOCIAL_LINKS.x,
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
export async function SiteHeader() {
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
        <a href={SITE_LINKS.github} className="zq-link zq-top-gh" rel="noreferrer noopener" aria-label="Zeqqat on GitHub">
          <span
            className="zq-mono-logo"
            style={{ maskImage: "url(/logos/github.svg)", WebkitMaskImage: "url(/logos/github.svg)" }}
            aria-hidden="true"
          />
          <span className="zq-top-gh-t">GitHub</span>
        </a>
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
            <li><a href={SITE_LINKS.releases}>Releases</a></li>
          </ul>
        </nav>
        <nav aria-label="Community">
          <h2>Community</h2>
          <ul>
            <li><a href={SITE_LINKS.github} rel="noreferrer noopener">GitHub</a></li>
            {SITE_LINKS.discord ? (
              <li><a href={SITE_LINKS.discord} rel="noreferrer noopener">Discord</a></li>
            ) : null}
            <li><a href={SITE_LINKS.x} rel="noreferrer noopener">X (Twitter)</a></li>
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
