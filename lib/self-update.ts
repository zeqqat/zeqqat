import { dokploy, InstallError, type Target } from "./selfhost-install";

// In-app updates for a self-hosted install. The Dokploy template and the
// one-button install both run the "latest" image with pull_policy: always,
// so deploying the compose again is the whole update. Zeqqat needs to know
// which compose on which Dokploy is itself: it looks through the Dokploy
// instances it already holds for a compose whose env or domain carries
// this install's own address.

export type SelfCompose = {
  target: Target;
  composeId: string;
  // ZEQQAT_VERSION set to a fixed version in Dokploy: deploying again
  // would bring back the same version, so updating from here can't work.
  pinned: string | null;
};

type ComposeLike = {
  composeId: string;
  name?: string;
  appName?: string;
  env?: string | null;
  domains?: { host?: string }[];
};

// Every object with a composeId anywhere in project.all's answer (its shape
// differs between Dokploy versions: projects, then environments, then compose).
export function collectComposes(value: unknown, out: ComposeLike[] = []): ComposeLike[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const v of value) collectComposes(v, out);
    return out;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.composeId === "string" && !out.some((c) => c.composeId === obj.composeId)) {
    out.push(obj as unknown as ComposeLike);
  }
  for (const v of Object.values(obj)) collectComposes(v, out);
  return out;
}

export function envMentionsHost(env: string | null | undefined, host: string): boolean {
  if (!env) return false;
  const m = env.match(/^\s*ZEQQAT_PUBLIC_URL\s*=\s*["']?([^"'\s]+)/m);
  if (!m) return false;
  try {
    return new URL(m[1]).host === host;
  } catch {
    return false;
  }
}

export function pinnedVersion(env: string | null | undefined): string | null {
  if (!env) return null;
  const m = env.match(/^\s*ZEQQAT_VERSION\s*=\s*["']?([^"'\s]*)/m);
  const v = m?.[1]?.trim();
  return v && v !== "latest" ? v : null;
}

function hostsOf(c: ComposeLike): string[] {
  return (c.domains ?? []).map((d) => d.host ?? "").filter(Boolean);
}

async function findOn(t: Target, host: string): Promise<SelfCompose | null> {
  const composes = collectComposes(await dokploy(t, "project.all"));
  const hit = (c: ComposeLike) => envMentionsHost(c.env, host) || hostsOf(c).includes(host);
  let found = composes.find(hit);
  if (!found) {
    // Some Dokploy versions leave env and domains out of project.all. Ask
    // per compose, likeliest first, and stop at a sane number of calls.
    const likely = [...composes].sort(
      (a, b) => Number(/zeqqat/i.test(`${b.name}${b.appName}`)) - Number(/zeqqat/i.test(`${a.name}${a.appName}`)),
    );
    for (const c of likely.slice(0, 25)) {
      const one = (await dokploy(t, "compose.one", undefined, { composeId: c.composeId })) as ComposeLike;
      if (hit(one)) {
        found = one;
        break;
      }
      const domains = await dokploy(t, "domain.byComposeId", undefined, { composeId: c.composeId });
      if (Array.isArray(domains) && domains.some((d) => (d as { host?: string }).host === host)) {
        found = { ...one, composeId: c.composeId };
        break;
      }
    }
  }
  if (!found) return null;
  let env = found.env;
  if (env === undefined) {
    const one = (await dokploy(t, "compose.one", undefined, { composeId: found.composeId })) as ComposeLike;
    env = one?.env;
  }
  return { target: t, composeId: found.composeId, pinned: pinnedVersion(env) };
}

// The first Dokploy that runs this install. Unreachable instances or bad
// keys are skipped: another instance may still be the right one.
export async function findSelfCompose(targets: Target[], host: string): Promise<SelfCompose | null> {
  for (const t of targets) {
    try {
      const found = await findOn(t, host);
      if (found) return found;
    } catch (err) {
      if (!(err instanceof InstallError)) throw err;
    }
  }
  return null;
}

export async function deploySelf(self: SelfCompose, toVersion: string, host: string) {
  await dokploy(self.target, "compose.deploy", {
    composeId: self.composeId,
    title: `Update Zeqqat to v${toVersion}`,
    description: `From ${host}`,
  });
}
