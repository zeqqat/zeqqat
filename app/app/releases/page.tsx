import { ReleaseRow } from "../../../components/VersionPill";
import { releaseStatus } from "../../../lib/changelog";
import { requireWorkspace } from "../../../lib/guard";

// Every release, newest first, marked with the one you're on. The footer's
// version pill opens the same list in a modal; this is its full page. The
// public /releases shows the same list without Your version.
export default async function ReleasesPage() {
  await requireWorkspace();
  const status = await releaseStatus();
  return (
    <div className="zq-releases">
      <p className="zq-kicker">Zeqqat</p>
      <h1 className="zq-h">
        Releases<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        You&apos;re on v{status.current}
        {status.updateAvailable ? `. v${status.latest} is out; update from the version at the bottom of the menu.` : ", the latest version."}
      </p>
      <div style={{ marginTop: 24 }}>
        {status.releases.map((r) => (
          <ReleaseRow key={r.version} r={r} current={status.current} latest={status.releases[0]?.version} />
        ))}
      </div>
    </div>
  );
}
