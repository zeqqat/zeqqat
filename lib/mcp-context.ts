import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, connectionGrant, instance, integration, organization } from "../db/schema";
import { integrationRef } from "./catalog";
import type { McpContext } from "./mcp-auth";
import { accessFor, accessSummary, type InstanceAccess } from "./policies";

// The context every tool result carries (project doc
// mcp-context-and-policy-v1, section 2). Clients differ on what reaches
// the model: some pass server instructions on, some drop them; some show
// a result's `content` text, others its `structuredContent`. So the same
// object goes in instructions, in the first content block of every
// result, and in structuredContent.context. JSON keys are camelCase.

export type ContextInstance = {
  name: string;
  // The policy attached to this instance on this connection (its canonical
  // name), or null when the connection allows tools by kind instead.
  policy: string | null;
  policySummary: string;
};

export type ContextIntegration = {
  name: string; // @author/slug: whose tool set this is
  title: string; // "Dokploy"
  // How many tools the integration has (its catalog, not what this
  // connection may run: permissions are policySummary and allowedOn).
  toolCount: number;
  // What kinds of tools exist (each endpoint's first spec tag), so the
  // agent knows what to search for. Only in the full context
  // (zeqqat_whoami): repeated on every result, it would cost too much.
  categories?: string[];
  instances: ContextInstance[];
};

// The account that owns the connection (not the caller). "username" is
// the same field for people and organizations: it is the word people use
// (project doc context-account-and-catalog-v1).
export type ContextAccount = {
  username: string;
  type: "personal" | "organization";
};

export type ZeqqatContext = {
  account: ContextAccount;
  workspace: string;
  connection: string | null;
  integrations: ContextIntegration[];
  missing: string;
  notice: string | null;
};

export type ReachableInstance = {
  id: string;
  alias: string;
  integrationId: string;
  integrationSlug: string;
  integrationTitle: string;
  integrationOrgSlug: string;
  access: InstanceAccess;
};

const MISSING =
  "Only the integrations listed here are connected. If the user needs another one, tell them it is not on this connection; they can add it in the Zeqqat dashboard.";

// Added to `missing` in the compact context, which has no categories.
const CATEGORIES_HINT = " Call zeqqat_whoami to see each integration's tool categories.";

export type CatalogStats = { toolCount: number; categories: string[] };

// Above this many instances, the context sent with every result is cut
// down to counts; zeqqat_whoami always returns the full list.
export const FULL_CONTEXT_MAX_INSTANCES = 20;

// The instances this connection reaches, with what the caller may do on
// each (a policy, or kinds). Checked fresh on every call.
export async function reachableInstances(
  ctx: Pick<McpContext, "connectionId" | "workspaceId" | "callerRole">,
): Promise<ReachableInstance[]> {
  const rows = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      integrationId: integration.id,
      integrationSlug: integration.slug,
      integrationTitle: integration.name,
      integrationOrgSlug: organization.slug,
    })
    .from(connectionGrant)
    .innerJoin(instance, eq(instance.id, connectionGrant.instanceId))
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(and(eq(connectionGrant.connectionId, ctx.connectionId), eq(instance.workspaceId, ctx.workspaceId)))
    .orderBy(asc(integration.slug), asc(instance.alias));
  return Promise.all(
    rows.map(async (r) => ({ ...r, access: await accessFor(ctx.connectionId, r.id, ctx.callerRole) })),
  );
}

// Tool count and categories per integration id: live endpoints only
// (removed ones can't be searched or run). A category is an endpoint's
// first spec tag, raw, because the agent searches with it.
export async function catalogStats(integrationIds: string[]): Promise<Map<string, CatalogStats>> {
  const out = new Map<string, CatalogStats>();
  if (integrationIds.length === 0) return out;
  const rows = await db
    .select({
      integrationId: apiEndpoint.integrationId,
      toolCount: sql<number>`count(*)::int`,
      categories: sql<(string | null)[]>`array_agg(distinct ${apiEndpoint.tags}->>0)`,
    })
    .from(apiEndpoint)
    .where(and(inArray(apiEndpoint.integrationId, integrationIds), isNull(apiEndpoint.removedAt)))
    .groupBy(apiEndpoint.integrationId);
  for (const r of rows) {
    out.set(r.integrationId, { toolCount: Number(r.toolCount), categories: sortedCategories(r.categories ?? []) });
  }
  return out;
}

export function sortedCategories(tags: (string | null | undefined)[]): string[] {
  return [...new Set(tags.filter((t): t is string => typeof t === "string" && t.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

type ContextOwner = Pick<McpContext, "organizationSlug" | "organizationKind" | "workspaceName" | "notice"> & {
  connectionName?: string | null;
};

// Pure: builds the context object from what reachableInstances returned.
// `full` is zeqqat_whoami's shape: every instance and the categories.
export function contextFrom(
  ctx: ContextOwner,
  instances: ReachableInstance[],
  opts: { full?: boolean; stats?: Map<string, CatalogStats> } = {},
): ZeqqatContext {
  const byIntegration = new Map<string, ContextIntegration>();
  for (const i of instances) {
    const name = integrationRef(i.integrationOrgSlug, i.integrationSlug);
    const stats = opts.stats?.get(i.integrationId) ?? { toolCount: 0, categories: [] };
    const entry: ContextIntegration = byIntegration.get(name) ?? {
      name,
      title: i.integrationTitle,
      toolCount: stats.toolCount,
      ...(opts.full ? { categories: stats.categories } : {}),
      instances: [],
    };
    entry.instances.push({
      name: i.alias,
      policy: i.access.mode === "policy" ? i.access.policy.canonical : null,
      policySummary: accessSummary(i.access),
    });
    byIntegration.set(name, entry);
  }
  let integrations = [...byIntegration.values()];
  if (!opts.full && instances.length > FULL_CONTEXT_MAX_INSTANCES) {
    integrations = integrations.map((g) => ({
      ...g,
      instances: [],
      title: `${g.title} (${g.instances.length} instances, call zeqqat_whoami for the list)`,
    }));
  }
  return {
    account: { username: ctx.organizationSlug, type: ctx.organizationKind },
    workspace: ctx.workspaceName,
    connection: ctx.connectionName ?? null,
    integrations,
    missing: opts.full || integrations.length === 0 ? MISSING : MISSING + CATEGORIES_HINT,
    notice: ctx.notice ?? null,
  };
}

export async function buildContext(ctx: McpContext, opts: { full?: boolean } = {}): Promise<ZeqqatContext> {
  const instances = await reachableInstances(ctx);
  const stats = await catalogStats([...new Set(instances.map((i) => i.integrationId))]);
  return contextFrom(ctx, instances, { ...opts, stats });
}

// Whether anything this connection reaches lets this caller delete. Used
// for zeqqat_run's destructiveHint in tools/list, so a connection that can
// only read, create and edit doesn't present zeqqat_run as destructive.
// The executor still checks every call; this only sets the label.
export async function mayDelete(instances: ReachableInstance[]): Promise<boolean> {
  for (const i of instances) {
    if (i.access.mode === "kinds" && i.access.perm.delete) return true;
  }
  for (const i of instances) {
    if (i.access.mode !== "policy" || !i.access.roleCap.delete || i.access.policy.allow.length === 0) continue;
    const hit = await db
      .select({ name: apiEndpoint.name })
      .from(apiEndpoint)
      .where(
        and(
          eq(apiEndpoint.integrationId, i.integrationId),
          inArray(apiEndpoint.name, i.access.policy.allow),
          eq(apiEndpoint.kind, "delete"),
          isNull(apiEndpoint.removedAt),
        ),
      )
      .limit(1);
    if (hit.length > 0) return true;
  }
  return false;
}
