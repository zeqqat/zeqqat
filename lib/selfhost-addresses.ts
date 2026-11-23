import { checkAddress } from "./reachability";
import { dokploy, type Target } from "./selfhost-install";

// Every address a Zeqqat install answers on, read from its compose's
// domains in Dokploy. People add their own domain in Dokploy (not through
// Zeqqat), often because their server doesn't take traffic on ports 80 and
// 443, so the free sslip.io address the install started with may never
// load. The Self-host page lists them all and opens the first that loads;
// the install itself accepts sign-up on any of them while it waits to be
// claimed (lib/own-domains.ts).

type DomainRow = { host?: string; path?: string | null; https?: boolean; serviceName?: string | null };

export async function composeAddresses(t: Target, composeId: string): Promise<string[]> {
  const rows = (await dokploy(t, "domain.byComposeId", undefined, { composeId })) as DomainRow[] | null;
  const out: string[] = [];
  for (const d of Array.isArray(rows) ? rows : []) {
    if (!d?.host) continue;
    if (d.serviceName && d.serviceName !== "zeqqat") continue;
    const path = d.path && d.path !== "/" ? d.path.replace(/\/$/, "") : "";
    const addr = `${d.https ? "https" : "http"}://${d.host.toLowerCase()}${path}`;
    if (!out.includes(addr)) out.push(addr);
  }
  return out;
}

export type CheckedAddress = { address: string; live: boolean };

// The free sslip.io / traefik.me addresses last: a domain someone added
// themselves is the one they mean to use.
function freeAddress(a: string): boolean {
  return /\.(sslip\.io|traefik\.me)(\/|$)/i.test(a);
}

export async function checkAddresses(addresses: string[]): Promise<CheckedAddress[]> {
  const checked = await Promise.all(
    addresses.map(async (address) => ({ address, live: (await checkAddress(address).catch(() => null))?.outcome === "live" })),
  );
  return checked.sort((a, b) => Number(b.live) - Number(a.live) || Number(freeAddress(a.address)) - Number(freeAddress(b.address)));
}
