import { BUNDLED } from "../../../lib/changelog";
import { APP_VERSION } from "../../../lib/version";

// The changelog of this build, newest first. Self-hosted installs ask
// zeqqat.com for it to learn whether a newer version is out and what changed
// (lib/changelog.ts). Public: it's the same list as the What's new page.
export function GET() {
  return Response.json(
    { latest: APP_VERSION, releases: BUNDLED },
    { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
  );
}
