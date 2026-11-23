import { decryptCredential } from "./crypto";
import { normalizeBaseUrl } from "./dokploy-check";
import { awaitingClaim } from "./seed-claim";
import { composeAddresses } from "./selfhost-addresses";

// A Zeqqat installed from zeqqat.com starts on Dokploy's free sslip.io
// address. Many servers don't take traffic on ports 80 and 443, so the
// owner adds their own domain in Dokploy (never through Zeqqat) and opens
// the install there, while ZEQQAT_PUBLIC_URL still names the sslip.io
// address. Until the install is claimed, sign-up has to work on any
// domain Dokploy routes to this install. The install asks its own Dokploy
// (with the key the seed carries) which domains its compose has, so a
// made-up Host header is never trusted. Once claimed, ZEQQAT_PUBLIC_URL is
// set to the address the owner claimed from (lib/seed-claim.ts).

let cache: { at: number; origins: Set<string> } | null = null;
const TTL_MS = 30_000;

async function ownOrigins(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.origins;
  const seed = await awaitingClaim();
  const origins = new Set<string>();
  if (seed?.composeId) {
    const baseUrl = normalizeBaseUrl(seed.instance.baseUrl);
    if (baseUrl) {
      try {
        const addresses = await composeAddresses({ baseUrl, apiKey: decryptCredential(seed.instance.credential) }, seed.composeId);
        for (const a of addresses) {
          const u = new URL(a);
          // Either scheme: a domain behind Cloudflare is often http in
          // Dokploy and https in the browser.
          origins.add(`https://${u.host}`);
          origins.add(`http://${u.host}`);
        }
      } catch {
        // Dokploy unreachable: nothing extra is trusted.
      }
    }
  }
  cache = { at: Date.now(), origins };
  return origins;
}

// The origin a request came on, if it is one of this unclaimed install's
// own domains in Dokploy and not ZEQQAT_PUBLIC_URL's host. Null otherwise.
export async function claimOrigin(h: Headers): Promise<string | null> {
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0]?.trim().toLowerCase();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (!host || (proto !== "http" && proto !== "https")) return null;
  try {
    if (new URL(process.env.ZEQQAT_PUBLIC_URL ?? "").host.toLowerCase() === host) return null;
  } catch {
    // no public URL: fall through
  }
  const origin = `${proto}://${host}`;
  return (await ownOrigins()).has(origin) ? origin : null;
}
