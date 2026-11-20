import type { Metadata } from "next";
import { PublicHeader } from "../../../components/PublicHeader";
import { pageMeta } from "../../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Self-host Zeqqat on Dokploy",
  description:
    "Run Zeqqat, the open source MCP for Dokploy, on your own Dokploy: set it up from Zeqqat Cloud in one click, or install the Dokploy template.",
  path: "/docs/self-host",
});

// Anyone self-hosting Zeqqat already runs Dokploy, so there are two ways in
// and no manual steps: Zeqqat Cloud installs it for them, or they pick the
// template in Dokploy. Flip TEMPLATE_IS_LATEST once Dokploy's template
// follows `latest` (deploy/dokploy is ready for that PR).
const TEMPLATE_IS_LATEST = false;
const TEMPLATE_PINNED = "0.1.0";
const DOKPLOY_TEMPLATE = "https://dokploy.com/templates/zeqqat";

export default function SelfHostPage() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <h1 className="zq-h">
          Self-host Zeqqat<span className="dot">.</span>
        </h1>
        <section className="zq-block">
          <div className="zq-grid2">
            <a className="zq-way" href="/signup">
              <h2 className="zq-way-t">Set up via Zeqqat Cloud</h2>
              <p className="zq-way-p">
                Create an account, add your Dokploy, and Zeqqat installs your self-hosted instance on it for you.
              </p>
              <span className="zq-way-go">
                Get started <span aria-hidden="true">&rarr;</span>
              </span>
            </a>
            <a className="zq-way" href={DOKPLOY_TEMPLATE} rel="noreferrer noopener">
              <h2 className="zq-way-t">
                Install the Dokploy template
                {TEMPLATE_IS_LATEST ? (
                  <span className="zq-badge zq-badge-ok">Latest</span>
                ) : (
                  <span className="zq-badge zq-badge-warn">Stale</span>
                )}
              </h2>
              <p className="zq-way-p">
                {TEMPLATE_IS_LATEST
                  ? "Deploy Zeqqat from Dokploy's templates."
                  : `Deploy Zeqqat from Dokploy's templates. It is still pinned to v${TEMPLATE_PINNED}.`}
              </p>
              <span className="zq-way-go">
                Open the template <span aria-hidden="true">&rarr;</span>
              </span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
