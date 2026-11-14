import { CheckUpdatesOnPage } from "../../../components/CheckUpdates";
import { ReleaseRow, SelfUpdate } from "../../../components/VersionPill";
import { releaseStatus } from "../../../lib/changelog";
import { edition } from "../../../lib/edition";
import { requireWorkspace } from "../../../lib/guard";

// Every release, newest first, marked with the one you're on. The footer's
// version pill opens the same list in a modal; this is its full page. The
// public /releases shows the same list without Your version.
export default async function ReleasesPage() {
  await requireWorkspace();
  const status = await releaseStatus();
  return (
    <div className="zq-releases">
      <h1 className="zq-h">
        Releases<span className="dot">.</span>
      </h1>
      <p className="zq-sub">What changed in each version, newest first.</p>
      {edition() !== "cloud" && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <CheckUpdatesOnPage />
        </div>
      )}
      {edition() !== "cloud" && status.updateAvailable && (
        <div className="zq-rel-update">
          <SelfUpdate status={status} />
        </div>
      )}
      <div style={{ marginTop: 24 }}>
        {status.releases.map((r) => (
          <ReleaseRow key={r.version} r={r} showTime current={status.current} latest={status.releases[0]?.version} />
        ))}
      </div>
    </div>
  );
}
