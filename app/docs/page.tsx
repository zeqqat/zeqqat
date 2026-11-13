import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "../../components/PublicHeader";
import { DOC_PAGES } from "../../lib/agent-docs";
import { pageMeta } from "../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Docs",
  description:
    "Zeqqat docs: install Zeqqat on your own Dokploy, and how AI agents work with Dokploy through Zeqqat, from tools and permissions to secrets and errors.",
  path: "/docs",
});

// The front door for /docs: people and crawlers try it before any page
// under it. Two sets of docs, the self-host guide and the agent docs.
export default function DocsIndex() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Docs</p>
        <h1 className="zq-h">
          Zeqqat docs<span className="dot">.</span>
        </h1>
        <p className="zq-sub">Run Zeqqat on your own Dokploy, and see how an agent works with Dokploy through it.</p>
        <section className="zq-block">
          <div className="zq-list">
            <Link className="zq-item" href="/docs/self-host">
              <span className="zq-item-main">
                <span className="zq-item-t">Self-host Zeqqat on Dokploy</span>
                <span className="zq-item-s">One Docker Compose service and a Postgres database, from the template or step by step</span>
              </span>
            </Link>
            <Link className="zq-item" href="/docs/agents">
              <span className="zq-item-main">
                <span className="zq-item-t">Zeqqat for agents</span>
                <span className="zq-item-s">{DOC_PAGES.map((p) => p.title).join(" · ")}</span>
              </span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
