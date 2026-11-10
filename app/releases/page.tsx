import type { Metadata } from "next";
import { PublicHeader } from "../../components/PublicHeader";
import { ReleaseRow } from "../../components/VersionPill";
import { releaseStatus } from "../../lib/changelog";

export const metadata: Metadata = {
  title: "Releases",
  description: "What changed in each version of Zeqqat, the MCP gateway for Dokploy.",
};

// The public changelog: every release, newest first, the newest marked
// Latest. No sign-in, so no Your version tag, and nothing here says which
// version this install runs.
export default async function PublicReleases() {
  const { releases } = await releaseStatus();
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body zq-releases" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Zeqqat</p>
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
    </div>
  );
}
