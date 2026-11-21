import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, instance, integration, integrationApiSpecSnapshot, organization } from "../db/schema";
import { inWorkspaces } from "./instance-scope";
import { compareOps, type SpecOp } from "./instance-spec";

// The Dokploy integrations pages: which integrations a workspace (or a whole
// account) uses, one integration's tools, and how each instance's own API
// compares with it. An integration is reached through instances, so a
// workspace sees the integrations of its own instances; the account level
// sees those of every workspace the viewer can open, plus any the account
// published itself.

export const KINDS = ["read", "create", "edit", "delete"] as const;
export type Kind = (typeof KINDS)[number];
export type KindCounts = Record<Kind, number>;

export type IntegrationCard = {
  id: string;
  orgId: string;
  orgSlug: string;
  slug: string;
  name: string;
  release: string | null;
  toolCount: number;
  kinds: KindCounts;
};

const NONE = ["00000000-0000-0000-0000-000000000000"];

export async function integrationIdsForWorkspaces(workspaceIds: string[], ownOrgId?: string): Promise<string[]> {
  const used = await db
    .selectDistinct({ id: instance.integrationId })
    .from(instance)
    .where(inWorkspaces(workspaceIds));
  const ids = new Set(used.map((r) => r.id));
  if (ownOrgId) {
    const own = await db.select({ id: integration.id }).from(integration).where(eq(integration.organizationId, ownOrgId));
    for (const r of own) ids.add(r.id);
  }
  return [...ids];
}

export async function integrationCards(ids: string[]): Promise<IntegrationCard[]> {
  if (ids.length === 0) return [];
  const [rows, counts, releases] = await Promise.all([
    db
      .select({ id: integration.id, orgId: integration.organizationId, orgSlug: organization.slug, slug: integration.slug, name: integration.name })
      .from(integration)
      .innerJoin(organization, eq(organization.id, integration.organizationId))
      .where(inArray(integration.id, ids)),
    db
      .select({ id: apiEndpoint.integrationId, kind: apiEndpoint.kind, n: sql<number>`count(*)::int` })
      .from(apiEndpoint)
      .where(and(inArray(apiEndpoint.integrationId, ids), isNull(apiEndpoint.removedAt)))
      .groupBy(apiEndpoint.integrationId, apiEndpoint.kind),
    latestReleases(ids),
  ]);
  return rows
    .map((r) => {
      const kinds: KindCounts = { read: 0, create: 0, edit: 0, delete: 0 };
      for (const c of counts) if (c.id === r.id && c.kind in kinds) kinds[c.kind as Kind] = c.n;
      return { ...r, release: releases.get(r.id)?.release ?? null, toolCount: KINDS.reduce((a, k) => a + kinds[k], 0), kinds };
    })
    .sort((a, b) => `${a.orgSlug}/${a.slug}`.localeCompare(`${b.orgSlug}/${b.slug}`));
}

// The newest import of each integration: its release is the integration's version.
export async function latestReleases(ids: string[]) {
  const rows = await db
    .selectDistinctOn([integrationApiSpecSnapshot.integrationId], {
      integrationId: integrationApiSpecSnapshot.integrationId,
      snapshotId: integrationApiSpecSnapshot.id,
      release: integrationApiSpecSnapshot.release,
      importedAt: integrationApiSpecSnapshot.importedAt,
    })
    .from(integrationApiSpecSnapshot)
    .where(inArray(integrationApiSpecSnapshot.integrationId, ids.length ? ids : NONE))
    .orderBy(integrationApiSpecSnapshot.integrationId, desc(integrationApiSpecSnapshot.importedAt));
  return new Map(rows.map((r) => [r.integrationId, r]));
}

export async function liveToolNames(integrationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ name: apiEndpoint.name })
    .from(apiEndpoint)
    .where(and(eq(apiEndpoint.integrationId, integrationId), isNull(apiEndpoint.removedAt)));
  return new Set(rows.map((r) => r.name));
}

export type ToolRow = { id: string; name: string; summary: string | null; kind: Kind; method: string; path: string };

export async function integrationTools(integrationId: string, q: string, kinds: Kind[], limit = 100) {
  const filters = [
    eq(apiEndpoint.integrationId, integrationId),
    isNull(apiEndpoint.removedAt),
    q
      ? or(ilike(apiEndpoint.name, `%${q}%`), ilike(apiEndpoint.action, `%${q}%`), ilike(apiEndpoint.summary, `%${q}%`))
      : undefined,
    kinds.length && kinds.length < KINDS.length ? inArray(apiEndpoint.kind, kinds) : undefined,
  ].filter(Boolean) as ReturnType<typeof eq>[];
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: apiEndpoint.id,
        name: apiEndpoint.name,
        summary: apiEndpoint.summary,
        kind: apiEndpoint.kind,
        method: apiEndpoint.method,
        path: apiEndpoint.path,
      })
      .from(apiEndpoint)
      .where(and(...filters))
      .orderBy(asc(apiEndpoint.name))
      .limit(limit),
    db.select({ total: sql<number>`count(*)::int` }).from(apiEndpoint).where(and(...filters)),
  ]);
  return { rows: rows as ToolRow[], total };
}

export type InstanceCompare = {
  id: string;
  alias: string;
  baseUrl: string;
  workspaceName: string;
  version: string | null;
  extra: SpecOp[] | null;
  missing: string[] | null;
};

// The instances using an integration in the given workspaces, each compared
// with the integration's tools (null until its own API document was read).
export async function integrationInstances(integrationId: string, workspaceIds: string[]): Promise<InstanceCompare[]> {
  if (workspaceIds.length === 0) return [];
  const [rows, names] = await Promise.all([
    db
      .select({
        id: instance.id,
        alias: instance.alias,
        baseUrl: instance.baseUrl,
        workspaceName: organization.slug,
        version: instance.lastVersion,
        specOps: instance.specOps,
      })
      .from(instance)
      .innerJoin(organization, eq(organization.id, instance.organizationId))
      .where(and(eq(instance.integrationId, integrationId), inWorkspaces(workspaceIds)))
      .orderBy(asc(organization.slug), asc(instance.alias)),
    liveToolNames(integrationId),
  ]);
  return rows.map((r) => {
    const c = compareOps(r.specOps ?? null, names);
    return {
      id: r.id,
      alias: r.alias,
      baseUrl: r.baseUrl,
      workspaceName: r.workspaceName,
      version: r.version,
      extra: c?.extra ?? null,
      missing: c?.missing ?? null,
    };
  });
}

// "v0.31.2" against "v0.30.4": -1, 0, 1, or null when either isn't a version.
export function compareVersions(a: string | null, b: string | null): number | null {
  const parse = (v: string | null) => {
    const m = v?.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export async function integrationById(id: string) {
  const [row] = await db
    .select({ id: integration.id, orgId: integration.organizationId, orgSlug: organization.slug, orgName: organization.displayName, slug: integration.slug, name: integration.name, createdAt: integration.createdAt })
    .from(integration)
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(eq(integration.id, id))
    .limit(1);
  return row ?? null;
}
