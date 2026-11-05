import { redirect } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { edition } from "../lib/edition";
import { AgentRotator } from "../components/AgentRotator";
import { ProductDemo } from "../components/ProductDemo";

// Footer and CTA targets in one place. Every link here must resolve: add a
// page before linking to it.
const LINKS = {
  signin: "/signin",
  signup: "/signup",
  github: "https://github.com/zeqqat/zeqqat",
  docs: "/docs/agents",
  selfHost: "/docs/self-host",
  blog: "/blog",
  terms: "/terms",
  privacy: "/privacy",
  // Empty until a real invite exists. An expired invite renders a Discord
  // error page, which reads as an abandoned project, so absent beats dead.
  discord: "",
};

export default function LandingPage() {
  // The landing page sells zeqqat.com. A self-hosted install opens straight
  // into the app (which sends signed-out visitors to sign in).
  if (edition() === "self-hosted") redirect("/app");

  return (
    <div className="zq">
      <header className="zq-top">
        <div className="zq-top-left">
          <a href="/" className="zq-brand" aria-label="Zeqqat home">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <span className="zq-name">zeqqat</span>
          </a>
        </div>
        <div className="zq-top-right">
          <a href={LINKS.signin} className="zq-link zq-link-strong">
            Sign in
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="zq-mid">
        <main className="zq-in">
          <h1 className="zq-mark zq-mark-wide">
            Give AI access to your
            <br />
            APIs and MCPs.
            <br />
            Minus the risk<span className="dot">.</span>
          </h1>
          <p className="zq-tagline">
            Control and monitor every agent from one place:{" "}
            <br className="zq-br-wide" />
            <AgentRotator />{" "}
            <br className="zq-br-wide" />
            Decide what each one can and can&rsquo;t do, add teammates with their own roles, and
            keep your API keys, env vars and secrets away from the LLM.
          </p>

          <div className="zq-hero-cta">
            <a className="zq-hero-oss" href={LINKS.github} rel="noreferrer noopener">
              <span>Free and open source</span>
              <span
                className="zq-mono-logo"
                style={{ maskImage: "url(/logos/github.svg)", WebkitMaskImage: "url(/logos/github.svg)" }}
                aria-hidden="true"
              />
            </a>
            <a className="zq-hero-btn" href={LINKS.signup}>
              Get started free <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="zq-hero-note">
              Connect your agent once, add your APIs and MCPs, and pick what each agent may do.
              Dokploy is live today, more apps are on the way.
            </p>
            <p className="zq-hero-alt">
              Prefer your own server? <a href={LINKS.selfHost}>Self-host it</a>
            </p>
          </div>
        </main>
      </div>

      <div className="zq-demo-wrap">
        <ProductDemo />
      </div>

      <footer className="zq-sitefoot">
        <div className="zq-sitefoot-grid">
          <div className="zq-sitefoot-brand">
            <span className="zq-brand">
              <span className="zq-logo" aria-hidden="true">
                Z
              </span>
              <span className="zq-name">zeqqat</span>
            </span>
            <p>The open source gateway between AI and your APIs and MCPs.</p>
          </div>
          <nav aria-label="Product">
            <h2>Product</h2>
            <ul>
              <li><a href={LINKS.docs}>Docs</a></li>
              <li><a href={LINKS.selfHost}>Self-hosting</a></li>
              <li><a href={LINKS.blog}>Blog</a></li>
            </ul>
          </nav>
          <nav aria-label="Community">
            <h2>Community</h2>
            <ul>
              <li><a href={LINKS.github} rel="noreferrer noopener">GitHub</a></li>
              {LINKS.discord ? (
                <li><a href={LINKS.discord} rel="noreferrer noopener">Discord</a></li>
              ) : null}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h2>Legal</h2>
            <ul>
              <li><a href={LINKS.terms}>Terms</a></li>
              <li><a href={LINKS.privacy}>Privacy</a></li>
            </ul>
          </nav>
        </div>
        <div className="zq-sitefoot-base">
          <span>&copy; {new Date().getFullYear()} Zeqqat</span>
          <span>Free and open source</span>
        </div>
      </footer>
    </div>
  );
}
