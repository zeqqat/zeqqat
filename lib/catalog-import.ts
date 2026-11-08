// Imports one OpenAPI document into an org's catalog: the integration row,
// one immutable snapshot per distinct spec file, and one api_endpoint row
// per endpoint, upserted in place (Project context doc, sections 8 and 9).
//
// Safe to run again and again: the snapshot is keyed by (integration,
// sha256 of the raw file), endpoints by (integration, name). Re-running
// with the same spec still re-applies the kind map, so fixing a kind only
// needs a new kinds.json, not a new spec.

import { createHash } from "node:crypto";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { db as Db } from "../db";
import { apiEndpoint, integration, integrationApiSpecSnapshot } from "../db/schema";
import { newId } from "./id";
import { convertOpenApi, type KindMap } from "./importer/openapi";

export type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

export type ImportParams = {
  organizationId: string;
  orgSlug: string;
  integrationSlug: string;
  integrationName: string;
  official: boolean;
  rawSpec: string; // the file exactly as fetched; its sha256 is the snapshot hash
  sourceUrl: string | null;
  release: string | null;
  kinds: KindMap;
  summaries?: Record<string, string>;
  nameFrom?: "operationId" | "path";
};

export type ImportSummary = {
  integrationId: string;
  snapshotId: string;
  newSnapshot: boolean;
  endpoints: number;
  added: number;
  removed: number;
  unclassified: string[];
  warnings: string[];
};

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const CHUNK = 100;

export async function importSpec(tx: Tx, p: ImportParams): Promise<ImportSummary> {
  const doc = JSON.parse(p.rawSpec) as unknown;
  const hash = sha256(p.rawSpec);

  // Integration: one per (org, slug).
  let integ = await tx.query.integration.findFirst({
    where: and(eq(integration.organizationId, p.organizationId), eq(integration.slug, p.integrationSlug)),
  });
  if (!integ) {
    const id = newId();
    await tx.insert(integration).values({
      id,
      organizationId: p.organizationId,
      slug: p.integrationSlug,
      name: p.integrationName,
      official: p.official,
    });
    integ = (await tx.query.integration.findFirst({ where: eq(integration.id, id) }))!;
  } else if (integ.official !== p.official) {
    await tx.update(integration).set({ official: p.official }).where(eq(integration.id, integ.id));
  }

  // Snapshot: immutable, one per distinct file.
  let snapshot = await tx.query.integrationApiSpecSnapshot.findFirst({
    where: and(eq(integrationApiSpecSnapshot.integrationId, integ.id), eq(integrationApiSpecSnapshot.hash, hash)),
  });
  const newSnapshot = !snapshot;
  if (!snapshot) {
    const id = newId();
    await tx.insert(integrationApiSpecSnapshot).values({
      id,
      organizationId: p.organizationId,
      integrationId: integ.id,
      release: p.release,
      hash,
      sourceUrl: p.sourceUrl,
      rawSpec: doc,
    });
    snapshot = (await tx.query.integrationApiSpecSnapshot.findFirst({
      where: eq(integrationApiSpecSnapshot.id, id),
    }))!;
  }

  const existingRows = await tx
    .select({ name: apiEndpoint.name, action: apiEndpoint.action, removedAt: apiEndpoint.removedAt })
    .from(apiEndpoint)
    .where(eq(apiEndpoint.integrationId, integ.id));
  const existingActions = new Map(existingRows.map((r) => [r.name, r.action]));

  const { endpoints, warnings } = convertOpenApi(doc, {
    orgSlug: p.orgSlug,
    integrationSlug: p.integrationSlug,
    kinds: p.kinds,
    summaries: p.summaries,
    nameFrom: p.nameFrom,
    existingActions,
  });

  for (let i = 0; i < endpoints.length; i += CHUNK) {
    const rows = endpoints.slice(i, i + CHUNK).map((e) => ({
      id: newId(),
      organizationId: p.organizationId,
      integrationId: integ.id,
      lastSnapshotId: snapshot.id,
      name: e.name,
      action: e.action,
      major: 1,
      method: e.method,
      path: e.path,
      summary: e.summary,
      description: e.description,
      tags: e.tags,
      inputSchema: e.inputSchema,
      outputSchema: e.outputSchema,
      outputSchemaSource: "declared",
      pathParams: e.pathParams,
      queryParams: e.queryParams,
      bodyEncoding: e.bodyEncoding,
      credentialScheme: e.credentialScheme,
      kind: e.kind,
      importWarnings: e.importWarnings,
    }));
    await tx
      .insert(apiEndpoint)
      .values(rows)
      .onConflictDoUpdate({
        target: [apiEndpoint.integrationId, apiEndpoint.name],
        set: {
          organizationId: sql`excluded.organization_id`,
          lastSnapshotId: sql`excluded.last_snapshot_id`,
          method: sql`excluded.method`,
          path: sql`excluded.path`,
          // A summary the publisher accepted (lib/feedback.ts) stays; a
          // spec with no summary never erases one a person wrote.
          summary: sql`case when ${apiEndpoint.summarySource} = 'accepted' then ${apiEndpoint.summary} else coalesce(excluded.summary, ${apiEndpoint.summary}) end`,
          // Descriptions are authored: import fills them only when empty.
          description: sql`coalesce(${apiEndpoint.description}, excluded.description)`,
          tags: sql`excluded.tags`,
          inputSchema: sql`excluded.input_schema`,
          // An observed output shape beats the spec's.
          outputSchema: sql`case when ${apiEndpoint.outputSchemaSource} = 'observed' then ${apiEndpoint.outputSchema} else excluded.output_schema end`,
          pathParams: sql`excluded.path_params`,
          queryParams: sql`excluded.query_params`,
          bodyEncoding: sql`excluded.body_encoding`,
          credentialScheme: sql`excluded.credential_scheme`,
          kind: sql`excluded.kind`,
          importWarnings: sql`excluded.import_warnings`,
          removedAt: sql`null`,
        },
      });
  }

  // Endpoints gone from this spec: flagged, never deleted.
  const names = endpoints.map((e) => e.name);
  const toRemove = existingRows.filter((r) => r.removedAt === null && !names.includes(r.name)).map((r) => r.name);
  if (names.length > 0) {
    await tx
      .update(apiEndpoint)
      .set({ removedAt: new Date() })
      .where(and(eq(apiEndpoint.integrationId, integ.id), isNull(apiEndpoint.removedAt), notInArray(apiEndpoint.name, names)));
  }

  return {
    integrationId: integ.id,
    snapshotId: snapshot.id,
    newSnapshot,
    endpoints: endpoints.length,
    added: endpoints.filter((e) => !existingActions.has(e.name)).length,
    removed: toRemove.length,
    unclassified: endpoints.filter((e) => !(e.name in p.kinds)).map((e) => e.name),
    warnings,
  };
}

// Moves an integration (with its snapshots and endpoints) to another org,
// keeping every id: instances, policies and call logs keep pointing at it.
export async function moveIntegration(tx: Tx, integrationId: string, toOrganizationId: string) {
  await tx.update(integration).set({ organizationId: toOrganizationId }).where(eq(integration.id, integrationId));
  await tx
    .update(integrationApiSpecSnapshot)
    .set({ organizationId: toOrganizationId })
    .where(eq(integrationApiSpecSnapshot.integrationId, integrationId));
  await tx.update(apiEndpoint).set({ organizationId: toOrganizationId }).where(eq(apiEndpoint.integrationId, integrationId));
}
