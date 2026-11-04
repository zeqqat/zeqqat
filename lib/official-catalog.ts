// The official catalog: the integrations Zeqqat offers out of the box,
// owned by the @zeqqat organization and bundled in the repo under
// catalog/<slug>/ (spec, hand-assigned kinds, manifest). Imported on
// startup and before an instance is added, so every install (hosted or
// self-hosted) has the full catalog with no manual step.
//
// `zeqqat` is a reserved name (lib/username.ts), so nobody can sign up as
// it; the org is created here. Its owner is the operator: the owner of the
// org that held the official catalog before, otherwise the oldest user.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { integration, membership, organization, user, workspace } from "../db/schema";
import { importSpec, moveIntegration, sha256, type ImportSummary, type Tx } from "./catalog-import";
import { newId } from "./id";
import type { KindMap } from "./importer/openapi";

export const OFFICIAL_ORG_SLUG = "zeqqat";
const OFFICIAL_INTEGRATIONS = ["dokploy"];
const CATALOG_DIR = join(process.cwd(), "catalog");
// Any constant works; it only has to be the same for every replica.
const LOCK_KEY = 7_311_002_026;

type Manifest = {
  slug: string;
  name: string;
  nameFrom?: "operationId" | "path";
  sourceUrl: string | null;
  release: string | null;
  spec: string;
  kinds: string;
  summaries?: string;
};

type KindsFile = { specSha256?: string; kinds: KindMap };

async function ensureOfficialOrg(tx: Tx): Promise<string | null> {
  const found = await tx.query.organization.findFirst({ where: eq(organization.slug, OFFICIAL_ORG_SLUG) });
  if (found) return found.id;

  const [previous] = await tx
    .select({ ownerUserId: organization.ownerUserId })
    .from(integration)
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(eq(integration.official, true))
    .orderBy(asc(integration.createdAt))
    .limit(1);
  const ownerUserId =
    previous?.ownerUserId ??
    (await tx.select({ id: user.id }).from(user).orderBy(asc(user.createdAt)).limit(1))[0]?.id;
  if (!ownerUserId) return null; // no users yet; the next sync creates it

  const orgId = newId();
  await tx.insert(organization).values({
    id: orgId,
    slug: OFFICIAL_ORG_SLUG,
    displayName: "Zeqqat",
    kind: "organization",
    ownerUserId,
  });
  await tx.insert(workspace).values({ id: newId(), organizationId: orgId, slug: "default", name: "Default" });
  await tx.insert(membership).values({ id: newId(), userId: ownerUserId, organizationId: orgId, role: "owner" });
  console.log(`[zeqqat] created the @${OFFICIAL_ORG_SLUG} organization for the official catalog`);
  return orgId;
}

// If another org holds the official copy of this integration (the Dokploy
// catalog seeded before @zeqqat existed), move it to @zeqqat with its ids,
// so instances, policies and call logs stay attached. Then make sure
// @zeqqat's copy is the only one marked official.
async function adoptOfficialCopy(tx: Tx, orgId: string, slug: string) {
  const own = await tx.query.integration.findFirst({
    where: and(eq(integration.organizationId, orgId), eq(integration.slug, slug)),
  });
  if (!own) {
    const other = await tx.query.integration.findFirst({
      where: and(eq(integration.slug, slug), eq(integration.official, true), ne(integration.organizationId, orgId)),
      orderBy: asc(integration.createdAt),
    });
    if (other) {
      await moveIntegration(tx, other.id, orgId);
      console.log(`[zeqqat] moved the official ${slug} catalog to @${OFFICIAL_ORG_SLUG}`);
    }
  }
  await tx
    .update(integration)
    .set({ official: false })
    .where(and(eq(integration.slug, slug), eq(integration.official, true), ne(integration.organizationId, orgId)));
}

async function loadBundled(slug: string) {
  const dir = join(CATALOG_DIR, slug);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as Manifest;
  const rawSpec = await readFile(join(dir, manifest.spec), "utf8");
  const kindsFile = JSON.parse(await readFile(join(dir, manifest.kinds), "utf8")) as KindsFile;
  const summaries = manifest.summaries
    ? (JSON.parse(await readFile(join(dir, manifest.summaries), "utf8")) as { summaries: Record<string, string> }).summaries
    : undefined;
  return { manifest, rawSpec, kindsFile, summaries };
}

export async function syncOfficialCatalog(): Promise<ImportSummary[]> {
  const bundles = await Promise.all(OFFICIAL_INTEGRATIONS.map(loadBundled));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
    const orgId = await ensureOfficialOrg(tx);
    if (!orgId) {
      console.log("[zeqqat] no users yet; the official catalog is imported once someone signs up");
      return [];
    }
    const results: ImportSummary[] = [];
    for (const { manifest, rawSpec, kindsFile, summaries } of bundles) {
      if (kindsFile.specSha256 && kindsFile.specSha256 !== sha256(rawSpec)) {
        console.warn(`[zeqqat] ${manifest.slug}: kinds.json was reviewed against a different spec; check new endpoints`);
      }
      await adoptOfficialCopy(tx, orgId, manifest.slug);
      const s = await importSpec(tx, {
        organizationId: orgId,
        orgSlug: OFFICIAL_ORG_SLUG,
        integrationSlug: manifest.slug,
        integrationName: manifest.name,
        official: true,
        rawSpec,
        sourceUrl: manifest.sourceUrl,
        release: manifest.release,
        kinds: kindsFile.kinds,
        summaries,
        nameFrom: manifest.nameFrom,
      });
      console.log(
        `[zeqqat] official catalog @${OFFICIAL_ORG_SLUG}/${manifest.slug}: ${s.endpoints} endpoints` +
          ` (${s.added} new, ${s.removed} removed${s.newSnapshot ? ", new spec snapshot" : ""})` +
          (s.unclassified.length ? `; ${s.unclassified.length} without a kind (set to delete)` : ""),
      );
      for (const w of s.warnings) console.warn(`[zeqqat] ${manifest.slug} import: ${w}`);
      results.push(s);
    }
    return results;
  });
}

// Startup entry point: logs instead of throwing, like runMigrations, so a
// bad catalog never crash-loops the server. Set ZEQQAT_CATALOG_SYNC=0 to skip.
export async function syncOfficialCatalogOnStartup() {
  if (process.env.ZEQQAT_CATALOG_SYNC === "0" || !process.env.DATABASE_URL) return;
  try {
    await syncOfficialCatalog();
  } catch (err) {
    console.error("[zeqqat] official catalog sync failed:", err);
  }
}
