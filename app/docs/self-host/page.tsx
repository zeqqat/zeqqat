import type { Metadata } from "next";
import { PublicHeader } from "../../../components/PublicHeader";
import { pageMeta } from "../../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Self-host Zeqqat on Dokploy",
  description:
    "Run Zeqqat, the open source MCP for Dokploy, on your own Dokploy: set it up from Zeqqat Cloud in one click, or install the Zeqqat template in Dokploy.",
  path: "/docs/self-host",
});

// Anyone self-hosting Zeqqat already runs Dokploy, so there are two ways in
// and no manual steps: Zeqqat Cloud installs it for them, or they pick the
// template in Dokploy. Flip TEMPLATE_IS_LATEST once Dokploy's template
// follows `latest` (deploy/dokploy is ready for that PR).
const TEMPLATE_IS_LATEST = false;

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
            <a className="zq-way" href="/signup?next=/app/self-host">
              <h2 className="zq-way-t">Set up via Zeqqat Cloud</h2>
              <p className="zq-way-p">
                Create an account, add your Dokploy, and Zeqqat installs your self-hosted instance on it for you.
              </p>
              <span className="zq-way-go">
                Get started <span aria-hidden="true">&rarr;</span>
              </span>
            </a>
            <div className="zq-way">
              <h2 className="zq-way-t">
                Install the Zeqqat template
                {TEMPLATE_IS_LATEST ? (
                  <span className="zq-badge zq-badge-ok">Latest</span>
                ) : (
                  <span className="zq-badge zq-badge-warn">Stale</span>
                )}
              </h2>
              <p className="zq-way-p">
                In your Dokploy, create a service from a template and pick <b>Zeqqat</b>.
              </p>
              {TEMPLATE_IS_LATEST ? null : (
                <p className="zq-way-p">
                  For now it installs an older Zeqqat. Use Zeqqat Cloud to get the latest.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
