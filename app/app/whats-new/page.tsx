import { ReleaseRow } from "../../../components/VersionPill";
import { releaseStatus } from "../../../lib/changelog";
import { requireWorkspace } from "../../../lib/guard";

// Every version's changes, newest first. The footer's version pill opens
// the same list in a modal; this is its full page.
export default async function WhatsNewPage() {
  await requireWorkspace();
  const status = await releaseStatus();
  return (
    <div className="zq-whatsnew">
      <p className="zq-kicker">Zeqqat</p>
      <h1 className="zq-h">
        What&apos;s new<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        You&apos;re on v{status.current}
        {status.updateAvailable ? `. v${status.latest} is out; update from the version at the bottom of the menu.` : ", the latest version."}
      </p>
      <div style={{ marginTop: 24 }}>
        {status.releases.map((r) => (
          <ReleaseRow key={r.version} r={r} current={status.current} />
        ))}
      </div>
    </div>
  );
}
