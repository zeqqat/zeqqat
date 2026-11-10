import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";
import { ReleaseRow } from "../../components/VersionPill";
import { releaseStatus } from "../../lib/changelog";
import { pageMeta } from "../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Releases",
  description: "What changed in each version of Zeqqat, the MCP gateway for Dokploy.",
  path: "/releases",
});

// The public changelog: every release, newest first, the newest marked
// Latest. Same header and footer as the landing page. Each version links to
// its GitHub release, which release.yml publishes on every version bump.
export default async function PublicReleases() {
  const { releases } = await releaseStatus();
  return (
    <div className="zq">
      <SiteHeader />
      <main className="zq-body zq-releases">
        <h1 className="zq-h">
          Releases<span className="dot">.</span>
        </h1>
        <p className="zq-sub">What changed in each version, newest first.</p>
        <div style={{ marginTop: 24 }}>
          {releases.map((r) => (
            <ReleaseRow key={r.version} r={r} latest={releases[0]?.version} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
