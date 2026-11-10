import type { Metadata } from "next";
import { PublicHeader } from "../../../components/PublicHeader";
import { DOC_PAGES, sectionsOf } from "../../../lib/agent-docs";
import { pageMeta } from "../../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Zeqqat for agents",
  description:
    "Docs for AI agents working with Dokploy through Zeqqat: the tools an agent sees, what it may do, how secrets stay hidden, and what each error means.",
  path: "/docs/agents",
});

// The docs zeqqat_docs answers from, as pages a person can read. Every
// passage an agent gets links to its section here.
export default function AgentDocsIndex() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Docs</p>
        <h1 className="zq-h">
          Zeqqat for agents<span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          How an agent works with Zeqqat: the tools it sees, what it may do, and what to tell the user when something isn&rsquo;t
          allowed or connected. Agents read the same text through zeqqat_docs.
        </p>
        <section className="zq-block">
          <div className="zq-list">
            {DOC_PAGES.map((p) => (
              <a className="zq-item" key={p.id} href={`/docs/agents/${p.id}`}>
                <span className="zq-item-main">
                  <span className="zq-item-t">{p.title}</span>
                  <span className="zq-item-s">{sectionsOf(p.id).map((s) => s.title).join(" · ")}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
