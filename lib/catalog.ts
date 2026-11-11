import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, integration, organization, usernameAlias } from "../db/schema";
import { parseToolRef, toCanonical, toolPagePath } from "./tool-names";

// Catalog lookups by tool name. Agents pass the raw operationId
// ("application.deploy", what zeqqat_search shows and the spec calls it)
// together with an instance, which fixes the integration. These forms
// also work, for logs, links and later workflows:
//   the canonical name   @zeqqat/dokploy.http.application_deploy
//   the dotted name      dokploy.http.application_deploy
// Names are only read here, never rebuilt.

export type EndpointNames = {
  operationId: string;
  canonical: string;
  pagePath: string;
};

export function endpointNames(row: { name: string; action: string }, orgSlug: string, integrationSlug: string): EndpointNames {
  const parts = { org: orgSlug, target: integrationSlug, type: "http" as const, action: row.action };
  return { operationId: row.name, canonical: toCanonical(parts), pagePath: toolPagePath(parts) };
}

// The integration that owns an endpoint, as the model sees it in the
// context: @author/slug.
export function integrationRef(orgSlug: string, integrationSlug: string): string {
  return `@${orgSlug}/${integrationSlug}`;
}

// inArray with an empty list is invalid SQL; this id never matches.
const NO_ID = "00000000-0000-0000-0000-000000000000";

// The WHERE clause matching `ref` among endpoints, scoped to the given
// integrations. Anything that isn't a canonical or dotted name is treated
// as a raw operationId.
export function endpointRefCondition(ref: string, integrationIds: string[]): SQL | undefined {
  const scope = inArray(apiEndpoint.integrationId, integrationIds.length ? integrationIds : [NO_ID]);
  const trimmed = ref.trim();
  const parsed = parseToolRef(trimmed);
  if (parsed) {
    return and(
      scope,
      eq(apiEndpoint.action, parsed.action),
      eq(integration.slug, parsed.target),
      // An old username still names the same account's tools.
      parsed.org
        ? or(
            eq(organization.slug, parsed.org),
            inArray(organization.id, db.select({ id: usernameAlias.organizationId }).from(usernameAlias).where(eq(usernameAlias.slug, parsed.org))),
          )
        : undefined,
    );
  }
  return and(scope, eq(apiEndpoint.name, trimmed));
}

export type FoundEndpoint = typeof apiEndpoint.$inferSelect & {
  integrationSlug: string;
  integrationName: string;
  orgSlug: string;
};

// Every live endpoint matching `ref` within the given integrations. More
// than one means the ref is ambiguous (two integrations share an
// operationId); the caller decides how to ask for an instance or the
// canonical name. The newest major comes first.
export async function findEndpoints(ref: string, integrationIds: string[]): Promise<FoundEndpoint[]> {
  const rows = await db
    .select({ e: apiEndpoint, integrationSlug: integration.slug, integrationName: integration.name, orgSlug: organization.slug })
    .from(apiEndpoint)
    .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(and(endpointRefCondition(ref, integrationIds), isNull(apiEndpoint.removedAt)))
    .orderBy(desc(apiEndpoint.major));
  // One row per integration: the newest major of each.
  const seen = new Set<string>();
  const out: FoundEndpoint[] = [];
  for (const r of rows) {
    if (seen.has(r.e.integrationId)) continue;
    seen.add(r.e.integrationId);
    out.push({ ...r.e, integrationSlug: r.integrationSlug, integrationName: r.integrationName, orgSlug: r.orgSlug });
  }
  return out;
}

// One live endpoint by name within the given integrations, or null.
export async function findEndpoint(ref: string, integrationIds: string[]): Promise<FoundEndpoint | null> {
  const [first] = await findEndpoints(ref, integrationIds);
  return first ?? null;
}

// A tool page (zeqqat.com/<org>/<target.type.action>): every endpoint an
// org publishes, looked up by its URL segments. Removed endpoints still
// have a page, marked as removed, so old links keep resolving.
export async function findToolByPage(orgSlug: string, target: string, action: string) {
  const [row] = await db
    .select({ e: apiEndpoint, integrationSlug: integration.slug, integrationName: integration.name, orgSlug: organization.slug })
    .from(apiEndpoint)
    .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(and(eq(organization.slug, orgSlug), eq(integration.slug, target), eq(apiEndpoint.action, action)))
    .orderBy(desc(apiEndpoint.major))
    .limit(1);
  if (!row) return null;
  return { ...row.e, integrationSlug: row.integrationSlug, integrationName: row.integrationName, orgSlug: row.orgSlug };
}
