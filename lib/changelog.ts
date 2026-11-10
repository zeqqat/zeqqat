import entries from "../content/changelog.json";
import { edition } from "./edition";
import { APP_VERSION } from "./version";

// What changed in each version. content/changelog.json ships inside every
// build, newest first, and gets a new entry with every version bump
// (tests/unit/changelog.test.ts checks). A self-hosted install only has the
// entries up to its own version, so it asks zeqqat.com (which always runs
// the newest build) for /api/releases to learn about newer ones.

export type Release = { version: string; date: string; changes: string[] };

export type ReleaseStatus = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releases: Release[]; // newest first, the newer ones included
};

export const BUNDLED: Release[] = entries as Release[];

export const DEFAULT_RELEASES_URL = "https://zeqqat.com/api/releases";

// 1.2.10 > 1.2.9. Pre-release suffixes sort before their release.
export function compareVersions(a: string, b: string): number {
  const [ma, pa = ""] = a.replace(/^v/, "").split("-");
  const [mb, pb = ""] = b.replace(/^v/, "").split("-");
  const na = ma.split(".").map(Number);
  const nb = mb.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (pa === pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pa < pb ? -1 : 1;
}

// Remote entries newer than ours go on top; ours win for everything else.
export function mergeReleases(local: Release[], remote: Release[]): Release[] {
  const seen = new Set(local.map((r) => r.version));
  const extra = remote.filter((r) => isRelease(r) && !seen.has(r.version) && !r.version.includes("-"));
  return [...extra, ...local].sort((x, y) => compareVersions(y.version, x.version));
}

function isRelease(r: unknown): r is Release {
  const o = r as Release;
  return (
    !!o &&
    typeof o.version === "string" &&
    /^\d+\.\d+\.\d+/.test(o.version) &&
    typeof o.date === "string" &&
    Array.isArray(o.changes) &&
    o.changes.every((c) => typeof c === "string")
  );
}

let cache: { at: number; remote: Release[] } | null = null;
const TTL = 60 * 60 * 1000;

async function fetchRemote(): Promise<Release[]> {
  if (process.env.ZEQQAT_UPDATE_CHECK === "0") return [];
  if (cache && Date.now() - cache.at < TTL) return cache.remote;
  let remote: Release[] = [];
  try {
    const res = await fetch(process.env.ZEQQAT_RELEASES_URL || DEFAULT_RELEASES_URL, {
      headers: { accept: "application/json", "user-agent": `zeqqat/${APP_VERSION}` },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { releases?: unknown };
      if (Array.isArray(data.releases)) remote = data.releases.filter(isRelease);
    }
  } catch {
    // Offline or zeqqat.com down: say nothing rather than guess.
  }
  cache = { at: Date.now(), remote };
  return remote;
}

export async function releaseStatus(): Promise<ReleaseStatus> {
  const remote = edition() === "cloud" ? [] : await fetchRemote();
  const releases = mergeReleases(BUNDLED, remote);
  const latest = releases[0]?.version ?? APP_VERSION;
  return {
    current: APP_VERSION,
    latest: compareVersions(latest, APP_VERSION) > 0 ? latest : APP_VERSION,
    updateAvailable: compareVersions(latest, APP_VERSION) > 0,
    releases,
  };
}

// After an update, ask again instead of trusting an hour-old answer.
export function forgetRemote() {
  cache = null;
}
