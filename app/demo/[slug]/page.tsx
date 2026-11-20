import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DemoReplay } from "../../../components/DemoReplay";
import { SITE_LINKS, SiteFooter, SiteHeader } from "../../../components/SiteChrome";
import { REPLAYS, replayBySlug } from "../../../lib/demo-replays";
import { edition } from "../../../lib/edition";
import { pageMeta } from "../../../lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return REPLAYS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = replayBySlug(slug);
  if (!r) return {};
  return pageMeta({
    title: r.title,
    description: `"${r.ask}" Ask Claude about your Dokploy through Zeqqat, and see what Zeqqat logs while it answers.`,
    path: `/demo/${r.slug}`,
  });
}

// The landing page's example questions, each played back: the agent's chat
// beside Zeqqat's activity. Replays of real runs with the names changed
// (lib/demo-replays.ts); nobody's Dokploy is touched.
export default async function DemoPage({ params }: Props) {
  if (edition() === "self-hosted") redirect("/signin");
  const { slug } = await params;
  const replay = replayBySlug(slug);
  if (!replay) notFound();

  return (
    <div className="zq">
      <SiteHeader />
      <main className="zq-body zq-demo-page">
        <nav className="zq-demo-tabs" aria-label="Questions">
          {REPLAYS.map((r) => (
            <a key={r.slug} href={`/demo/${r.slug}`} aria-current={r.slug === replay.slug ? "page" : undefined}>
              {r.ask}
            </a>
          ))}
        </nav>
        <p className="zq-demo-label">A replay of a real run through Zeqqat. App names changed.</p>

        <DemoReplay key={replay.slug} replay={replay} />

        <div className="zq-demo-cta">
          <a className="zq-hero-btn" href={SITE_LINKS.signup}>
            Connect your Dokploy <span aria-hidden="true">&rarr;</span>
          </a>
          <p className="zq-hero-alt">
            Prefer your own server? <a href={SITE_LINKS.selfHost}>Self-host it</a>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
