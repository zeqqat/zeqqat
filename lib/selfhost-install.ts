import { randomBytes } from "node:crypto";
import { siteHost } from "./edition";
import { checkAddress, type AddressOutcome } from "./reachability";
import { SELFHOST_COMPOSE } from "./selfhost-compose";

// The steps of the one-button self-host install, as plain calls to the
// user's Dokploy (lib/actions/selfhost.ts wraps them with auth). Kept apart
// from the actions so tests/e2e/selfhost-install-flow.ts can run them
// against a stand-in Dokploy.

export type Target = { baseUrl: string; apiKey: string };

export class InstallError extends Error {}

export async function dokploy(
  t: Target,
  op: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) {
  const url = new URL(`${t.baseUrl}/api/${op}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "x-api-key": t.apiKey,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new InstallError(`Couldn't reach your Dokploy (${op}).`);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 || res.status === 403) {
    throw new InstallError(
      "Dokploy refused the API key. Replace it on the instance page and try again.",
    );
  }
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message;
    throw new InstallError(
      `Dokploy said no to ${op}${msg ? `: ${msg}` : ` (HTTP ${res.status})`}.`,
    );
  }
  return data;
}

// Dokploy's responses differ between versions (project.create returns the
// project, or the project and its environment). Look for the field anywhere.
export function findDeep(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj[key] === "string") return obj[key] as string;
  for (const v of Object.values(obj)) {
    const found = findDeep(v, key);
    if (found) return found;
  }
  return undefined;
}

export type Created = {
  ok: true;
  projectId: string;
  environmentId: string;
  composeId: string;
  appName: string;
  dashboardUrl: string;
};

// Step 1: a project called zeqqat and, in it, the compose service.
export async function createStep(t: Target): Promise<Created> {
  const project = await dokploy(t, "project.create", {
    name: "zeqqat",
    description: `Zeqqat, installed from ${siteHost()}`,
  });
  const projectId = findDeep(project, "projectId");
  if (!projectId)
    throw new InstallError(
      "Dokploy created the project but didn't say its id.",
    );
  let environmentId = findDeep(project, "environmentId");
  if (!environmentId) {
    const all = (await dokploy(t, "project.all")) as unknown[];
    const mine = Array.isArray(all)
      ? all.find((p) => findDeep(p, "projectId") === projectId)
      : undefined;
    environmentId = findDeep(mine, "environmentId");
  }
  if (!environmentId)
    throw new InstallError(
      "Couldn't find the new project's environment in Dokploy.",
    );

  const compose = await dokploy(t, "compose.create", {
    name: "zeqqat",
    description: "Zeqqat MCP gateway and its Postgres",
    environmentId,
    composeType: "docker-compose",
    composeFile: SELFHOST_COMPOSE,
  });
  const composeId = findDeep(compose, "composeId");
  if (!composeId)
    throw new InstallError(
      "Dokploy created the service but didn't say its id.",
    );
  await dokploy(t, "compose.update", {
    composeId,
    sourceType: "raw",
    composeFile: SELFHOST_COMPOSE,
  });
  let appName = findDeep(compose, "appName");
  if (!appName)
    appName = findDeep(
      await dokploy(t, "compose.one", undefined, { composeId }),
      "appName",
    );
  if (!appName)
    throw new InstallError(
      "Couldn't read the new service's name from Dokploy.",
    );

  const dashboardUrl = `${t.baseUrl}/dashboard/project/${projectId}/environment/${environmentId}/services/compose/${composeId}`;
  return {
    ok: true as const,
    projectId,
    environmentId,
    composeId,
    appName,
    dashboardUrl,
  };
}

// Step 2: Dokploy's free address (it already points at the server, no DNS),
// and the environment with freshly generated secrets.
export async function configureStep(
  t: Target,
  composeId: string,
  appName: string,
): Promise<{ ok: true; address: string }> {
  const generated = await dokploy(t, "domain.generateDomain", { appName });
  const host =
    typeof generated === "string" ? generated : findDeep(generated, "host");
  if (!host) throw new InstallError("Dokploy didn't generate an address.");
  // Dokploy builds the name from the server's IP; when it doesn't know it,
  // the name points at 127.0.0.1 and could never load.
  if (/(^|-)127-0-0-1\./.test(host)) {
    throw new InstallError(
      "Dokploy doesn't know this server's public IP yet, so its free address would point nowhere. Set the server IP in Dokploy's web server settings, then try again.",
    );
  }
  // sslip.io addresses get a Let's Encrypt certificate; older Dokploy's
  // traefik.me addresses can't, so they stay on http.
  const https = !/\.traefik\.me$/i.test(host);
  await dokploy(t, "domain.create", {
    host,
    path: "/",
    port: 3000,
    https,
    certificateType: https ? "letsencrypt" : "none",
    composeId,
    serviceName: "zeqqat",
    domainType: "compose",
  });
  const address = `${https ? "https" : "http"}://${host}`;
  const env = [
    `ZEQQAT_PUBLIC_URL=${address}`,
    `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`,
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`,
    `ZEQQAT_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
  ].join("\n");
  await dokploy(t, "compose.update", { composeId, env });
  return { ok: true as const, address };
}

// Step 3.
export async function deployStep(
  t: Target,
  composeId: string,
): Promise<{ ok: true }> {
  await dokploy(t, "compose.deploy", {
    composeId,
    title: "Install Zeqqat",
    description: `From ${siteHost()}`,
  });
  return { ok: true as const };
}

export type InstallStatus = {
  ok: true;
  deploy: "queued" | "running" | "done" | "error";
  reach?: AddressOutcome;
};

// Polled by the page: the deploy's state, then whether the address loads
// from the internet (same check as zeqqat_check).
export async function statusStep(
  t: Target,
  composeId: string,
  address: string,
): Promise<InstallStatus> {
  const compose = await dokploy(t, "compose.one", undefined, { composeId });
  const s = findDeep(compose, "composeStatus");
  const deploy =
    s === "done"
      ? "done"
      : s === "error"
        ? "error"
        : s === "running"
          ? "running"
          : "queued";
  if (deploy !== "done") return { ok: true as const, deploy };
  const check = await checkAddress(address);
  return { ok: true as const, deploy, reach: check?.outcome ?? "not_found" };
}
