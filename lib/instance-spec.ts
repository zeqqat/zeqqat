// The API an instance actually serves, read from its own OpenAPI document.
// Dokploy builds that document at runtime from its routers, so it can list
// operations the spec file in Dokploy's repo doesn't (v0.31.2 serves
// application.deployNginxQuickstart; the repo's openapi.json at the same tag
// doesn't have it). Compared with the integration's endpoints on the
// integration's page. Display only: nothing here makes a tool callable.

export type SpecOp = { name: string; method: string };
export type InstanceSpec = { version: string | null; ops: SpecOp[] };

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

// Operation names the way the Dokploy catalog names them: the path without
// its leading slash (`/application.stop` -> `application.stop`).
export function opsFromSpec(doc: unknown): InstanceSpec | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { info?: { version?: unknown }; paths?: Record<string, Record<string, unknown>> };
  if (!d.paths || typeof d.paths !== "object") return null;
  const ops: SpecOp[] = [];
  for (const [path, item] of Object.entries(d.paths)) {
    if (!item || typeof item !== "object") continue;
    const name = path.replace(/^\/+/, "");
    if (!name) continue;
    const method = Object.keys(item).find((m) => METHODS.has(m.toLowerCase()));
    if (method) ops.push({ name, method: method.toUpperCase() });
  }
  ops.sort((a, b) => a.name.localeCompare(b.name));
  return { version: typeof d.info?.version === "string" ? d.info.version : null, ops };
}

export async function fetchDokploySpec(baseUrl: string, apiKey: string): Promise<InstanceSpec | null> {
  const res = await fetch(`${baseUrl}/api/settings.getOpenApiDocument`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return opsFromSpec(await res.json());
}

// What differs between an instance's API and its integration's tools.
export function compareOps(instanceOps: SpecOp[] | null, integrationNames: Set<string>) {
  if (!instanceOps) return null;
  const mine = new Set(instanceOps.map((o) => o.name));
  const extra = instanceOps.filter((o) => !integrationNames.has(o.name));
  const missing = [...integrationNames].filter((n) => !mine.has(n)).sort();
  return { extra, missing };
}
