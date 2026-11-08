import { redirect } from "next/navigation";
import { edition } from "../lib/edition";
import { AgentRotator } from "../components/AgentRotator";
import { IntegrationsStrip } from "../components/IntegrationsStrip";
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
              Connect your agent once, add your apps, and pick what each agent may do. Dokploy is
              ready to go, and any app with an OpenAPI spec adds in a minute.
            </p>
            <p className="zq-hero-alt">
              Prefer your own server? <a href={SITE_LINKS.selfHost}>Self-host it</a>
            </p>
          </div>

          <IntegrationsStrip />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
