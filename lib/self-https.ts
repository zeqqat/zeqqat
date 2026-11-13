import { dokploy, InstallError } from "./selfhost-install";
import type { SelfCompose } from "./self-update";

// "Turn on HTTPS" for a self-hosted install served over plain http, through
// the Dokploy that runs it (the same one found for in-app updates): give
// its domain a Let's Encrypt certificate, point ZEQQAT_PUBLIC_URL at https,
// and redeploy. Agents like Claude only connect to https addresses.

// Let's Encrypt can't issue for older Dokploy's traefik.me addresses, bare
// IPs, or local names.
export function canGetCertificate(host: string): boolean {
  const name = host.replace(/:\d+$/, "").toLowerCase();
  if (/\.traefik\.me$/.test(name)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.startsWith("[")) return false;
  if (name === "localhost" || name.endsWith(".localhost") || !name.includes(".")) return false;
  return true;
}

// The compose env with ZEQQAT_PUBLIC_URL moved to https for this host, or
// null when it already says https (or names another address).
export function envWithHttps(env: string, host: string): string | null {
  const re = /^(\s*ZEQQAT_PUBLIC_URL\s*=\s*["']?)http:\/\/([^"'\s/]+)(\/?)(["']?\s*)$/m;
  const m = env.match(re);
  if (!m || m[2].toLowerCase() !== host.toLowerCase()) return null;
  return env.replace(re, `$1https://$2$4`);
}

type DomainRow = {
  domainId: string;
  host?: string;
  path?: string | null;
  port?: number | null;
  serviceName?: string | null;
  https?: boolean;
  certificateType?: string;
};

export async function turnOnHttps(self: SelfCompose, host: string): Promise<{ url: string }> {
  const t = self.target;
  const domains = (await dokploy(t, "domain.byComposeId", undefined, { composeId: self.composeId })) as DomainRow[];
  const domain = Array.isArray(domains) ? domains.find((d) => d.host?.toLowerCase() === host.toLowerCase()) : undefined;
  if (!domain) throw new InstallError(`Couldn't find ${host} in this Zeqqat's domains in Dokploy.`);

  if (!domain.https || domain.certificateType !== "letsencrypt") {
    await dokploy(t, "domain.update", {
      domainId: domain.domainId,
      host: domain.host,
      path: domain.path ?? "/",
      port: domain.port ?? 3000,
      serviceName: domain.serviceName ?? "zeqqat",
      domainType: "compose",
      https: true,
      certificateType: "letsencrypt",
    });
  }

  const one = (await dokploy(t, "compose.one", undefined, { composeId: self.composeId })) as { env?: string | null };
  const env = envWithHttps(one?.env ?? "", host);
  if (env !== null) await dokploy(t, "compose.update", { composeId: self.composeId, env });

  // The domain's labels live in the compose, so it only applies on deploy.
  await dokploy(t, "compose.deploy", {
    composeId: self.composeId,
    title: "Turn on HTTPS",
    description: `From ${host}`,
  });
  return { url: `https://${host}` };
}
