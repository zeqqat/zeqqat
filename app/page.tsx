import { redirect } from "next/navigation";
import { edition } from "../lib/edition";
import { AgentRotator } from "../components/AgentRotator";
import { SITE_LINKS, SiteFooter, SiteHeader } from "../components/SiteChrome";

export default function LandingPage() {
  // The landing page sells zeqqat.com. A self-hosted install opens straight
  // into the app (which sends signed-out visitors to sign in).
  if (edition() === "self-hosted") redirect("/app");

  return (
    <div className="zq">
      <SiteHeader />

      <div className="zq-mid">
        <main className="zq-in">
          <h1 className="zq-mark zq-mark-wide">
            Give AI access to
            <br />
            your Dokploy.
            <br />
            Minus the risk<span className="dot">.</span>
          </h1>
          <p className="zq-tagline">
            The safe MCP for Dokploy, self-hosted or Cloud. Works with{" "}
            <br className="zq-br-wide" />
            <AgentRotator />{" "}
            <br className="zq-br-wide" />
            Let it deploy, read logs and fix your apps. You decide exactly what it may touch,
            see every call it makes, and your API keys, env vars and secrets never reach the LLM.
          </p>

          <div className="zq-hero-cta">
            <a className="zq-hero-oss" href={SITE_LINKS.github} rel="noreferrer noopener">
              <span>Free and open source</span>
              <span
                className="zq-mono-logo"
                style={{ maskImage: "url(/logos/github.svg)", WebkitMaskImage: "url(/logos/github.svg)" }}
                aria-hidden="true"
              />
            </a>
            <a className="zq-hero-btn" href={SITE_LINKS.signup}>
              Get started free <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="zq-hero-note">
              Nothing to install: one remote URL that works from Claude on your laptop or your
              phone. Add your Dokploy, pick what your agent may do, and you&rsquo;re done.
            </p>
            <p className="zq-hero-alt">
              Prefer your own server? <a href={SITE_LINKS.selfHost}>Self-host it</a>
            </p>
          </div>

        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
