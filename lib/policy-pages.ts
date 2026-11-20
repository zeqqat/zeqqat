import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { apiEndpoint, callLog, connection, connectionGrant, instance, integration, organization, policy, user, workspace } from "../db/schema";
import { toPolicyCanonical } from "./tool-names";

// Data for the Policies pages (account: every policy the account owns;
// workspace: the ones used there) and one policy's page (Map, MCP tools,
// Manage). Policies belong to the account; workspaces only use them.

export const KIND_ORDER = ["read", "create", "edit", "delete"] as const;
export type PKind = (typeof KIND_ORDER)[number];
export type KindCounts = Record<PKind, number>;
const ZERO: KindCounts = { read: 0, create: 0, edit: 0, delete: 0 };

export type PolicyCardData = {
  id: string; // "default" for the default policy
  name: string;
  prefix: string; // "@acme/dokploy.policy."; empty for the default policy
  version: number | null;
  allowed: KindCounts;
  totals: KindCounts;
  urls: number;
  instances: number;
  description: string;
};

// Live MCP tools of an integration, per kind.
export async function kindTotals(integrationId: string): Promise<KindCounts> {
  const rows = await db
    .select({ kind: apiEndpoint.kind, n: sql<number>`count(*)::int` })
    .from(apiEndpoint)
    .where(and(eq(apiEndpoint.integrationId, integrationId), isNull(apiEndpoint.removedAt)))
    .groupBy(apiEndpoint.kind);
  const out = { ...ZERO };
  for (const r of rows) if (r.kind in out) out[r.kind as PKind] = r.n;
  return out;
}

async function liveTools(integrationId: string) {
  return db
    .select({ name: apiEndpoint.name, kind: apiEndpoint.kind, summary: apiEndpoint.summary, createdAt: apiEndpoint.createdAt })
    .from(apiEndpoint)
    .where(and(eq(apiEndpoint.integrationId, integrationId), isNull(apiEndpoint.removedAt)))
    .orderBy(asc(apiEndpoint.name));
}

function allowedCounts(tools: { name: string; kind: string }[], allow: string[]): KindCounts {
  const set = new Set(allow);
  const out = { ...ZERO };
  for (const t of tools) if (set.has(t.name) && t.kind in out) out[t.kind as PKind]++;
  return out;
}

// What the default policy starts every MCP URL with: read, create and edit on,
// delete off (connection_grant's column defaults).
export function defaultAllowed(totals: KindCounts): KindCounts {
  return { read: totals.read, create: totals.create, edit: totals.edit, delete: 0 };
}

// The live grants (MCP URL × instance) in the given workspaces, with the
// policy each applies. Deleted MCP URLs don't count.
const connWs = alias(workspace, "conn_ws");

async function grantsIn(workspaceIds: string[]) {
  if (!workspaceIds.length) return [];
  return db
    .select({
      connectionId: connection.id,
      connectionName: connection.name,
      shortId: connection.shortId,
      instanceId: instance.id,
      instanceAlias: instance.alias,
      instanceWsSlug: workspace.slug,
      connectionWsSlug: connWs.slug,
      integrationId: instance.integrationId,
      policyId: connectionGrant.policyId,
    })
    .from(connectionGrant)
    .innerJoin(connection, eq(connection.id, connectionGrant.connectionId))
    .innerJoin(instance, eq(instance.id, connectionGrant.instanceId))
    .innerJoin(workspace, eq(workspace.id, instance.workspaceId))
    .innerJoin(connWs, eq(connWs.id, connection.workspaceId))
    .where(and(inArray(connection.workspaceId, workspaceIds), isNull(connection.deletedAt)))
    .orderBy(asc(connection.name), asc(instance.alias));
}

function usage(grants: { connectionId: string; instanceId: string }[]) {
  return { urls: new Set(grants.map((g) => g.connectionId)).size, instances: new Set(grants.map((g) => g.instanceId)).size };
}

// The cards for a Policies page. `onlyUsed` (the workspace page) keeps the
// policies used in those workspaces; the account page lists every policy the
// account owns. The default policy always comes first.
export async function policyCards(organizationId: string, workspaceIds: string[], onlyUsed: boolean): Promise<PolicyCardData[]> {
  const [rows, grants] = await Promise.all([
    db
      .select({ p: policy, ns: organization.slug, slug: integration.slug })
      .from(policy)
      .innerJoin(organization, eq(organization.id, policy.organizationId))
      .innerJoin(integration, eq(integration.id, policy.integrationId))
      .where(eq(policy.organizationId, organizationId))
      .orderBy(asc(policy.name)),
    grantsIn(workspaceIds),
  ]);
  const integrationIds = [...new Set([...rows.map((r) => r.p.integrationId), ...grants.map((g) => g.integrationId)])];
  const tools = new Map(await Promise.all(integrationIds.map(async (id) => [id, await liveTools(id)] as const)));
  const totals = new Map(integrationIds.map((id) => [id, countKinds(tools.get(id) ?? [])]));

  const defaults = grants.filter((g) => !g.policyId);
  const defTotals = totals.get(defaults[0]?.integrationId ?? grants[0]?.integrationId ?? rows[0]?.p.integrationId ?? "") ?? { ...ZERO };
  const out: PolicyCardData[] = [
    { id: "default", name: "Default policy", prefix: "", version: null, allowed: defaultAllowed(defTotals), totals: defTotals, description: "", ...usage(defaults) },
  ];
  for (const r of rows) {
    const mine = grants.filter((g) => g.policyId === r.p.id);
    if (onlyUsed && mine.length === 0) continue;
    const canonical = toPolicyCanonical(r.ns, r.slug, r.p.name);
    out.push({
      id: r.p.id,
      name: r.p.name,
      prefix: canonical.slice(0, canonical.length - r.p.name.length),
      version: r.p.version,
      allowed: allowedCounts(tools.get(r.p.integrationId) ?? [], r.p.allow ?? []),
      totals: totals.get(r.p.integrationId) ?? { ...ZERO },
      description: r.p.description,
      ...usage(mine),
    });
  }
  return out;
}

function countKinds(tools: { kind: string }[]): KindCounts {
  const out = { ...ZERO };
  for (const t of tools) if (t.kind in out) out[t.kind as PKind]++;
  return out;
}

export type MapRow = {
  connectionId: string;
  connectionName: string;
  shortId: string;
  instanceId: string;
  instanceAlias: string;
  instanceWsSlug: string;
  connectionWsSlug: string;
  calls: number;
};

// Where a policy is used: each MCP URL × instance that applies it, with the
// calls made through it in the last 7 days under this policy.
export async function policyMap(workspaceIds: string[], policyId: string | null, canonical: string | null): Promise<MapRow[]> {
  const grants = (await grantsIn(workspaceIds)).filter((g) => g.policyId === policyId);
  if (!grants.length) return [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const counts = await db
    .select({ c: callLog.connectionId, i: callLog.instanceId, n: sql<number>`count(*)::int` })
    .from(callLog)
    .where(
      and(
        inArray(callLog.connectionId, grants.map((g) => g.connectionId)),
        inArray(callLog.instanceId, grants.map((g) => g.instanceId)),
        gte(callLog.createdAt, since),
        canonical ? eq(callLog.policyName, canonical) : isNull(callLog.policyName),
      ),
    )
    .groupBy(callLog.connectionId, callLog.instanceId);
  const n = new Map(counts.map((r) => [`${r.c}:${r.i}`, r.n]));
  return grants.map((g) => ({
    connectionId: g.connectionId,
    connectionName: g.connectionName,
    shortId: g.shortId,
    instanceId: g.instanceId,
    instanceAlias: g.instanceAlias,
    instanceWsSlug: g.instanceWsSlug,
    connectionWsSlug: g.connectionWsSlug,
    calls: n.get(`${g.connectionId}:${g.instanceId}`) ?? 0,
  }));
}

export type ToolItem = { name: string; kind: PKind; summary: string; isNew: boolean };

// The MCP tools tab: every live tool of the integration. "New" means added
// to the integration after the policy was last saved and not on its list.
export async function policyTools(integrationId: string, allow: string[], savedAt: Date | null): Promise<ToolItem[]> {
  const set = new Set(allow);
  return (await liveTools(integrationId)).map((t) => ({
    name: t.name,
    kind: (KIND_ORDER as readonly string[]).includes(t.kind) ? (t.kind as PKind) : "delete",
    summary: t.summary ?? "",
    isNew: Boolean(savedAt && t.createdAt > savedAt && !set.has(t.name)),
  }));
}

export async function personOf(userId: string | null) {
  if (!userId) return null;
  const [row] = await db
    .select({ name: user.name, image: user.image, slug: organization.slug })
    .from(user)
    .leftJoin(organization, and(eq(organization.ownerUserId, user.id), eq(organization.kind, "personal")))
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

// The integration the default policy's tools come from in these workspaces.
export async function defaultIntegrationId(workspaceIds: string[], organizationId: string): Promise<string | null> {
  const g = await grantsIn(workspaceIds);
  if (g.length) return (g.find((x) => !x.policyId) ?? g[0]).integrationId;
  const [p] = await db.select({ id: policy.integrationId }).from(policy).where(eq(policy.organizationId, organizationId)).limit(1);
  return p?.id ?? null;
}
