import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  apiEndpoint,
  connectionGrant,
  instance,
  integration,
  integrationApiSpecSnapshot,
  organization,
  policy,
  policyRevision,
  user,
  workspace,
  workspacePolicy,
} from "../db/schema";
import { grantToPerm, intersect, NONE, ROLE_CAP, type CallerRole, type Kind, type Perm } from "./connections";
import { newId } from "./id";
import { toPolicyCanonical } from "./tool-names";

// Policies (project doc mcp-context-and-policy-v1, section 5): owned by a
// namespace, written for one integration's spec, attached to an instance
// inside a connection. An explicit allow list of operationIds; anything
// not listed is denied. The caller's role cap still applies on top, by
// the tool's kind (a viewer can only read, whatever the policy lists).

export type PolicySummary = {
  id: string;
  canonical: string;
  name: string;
  description: string;
  allow: string[];
  specRelease: string | null;
  version: number;
  namespace: string;
  integrationSlug: string;
};

// What one caller may do on one instance through one connection.
//   kinds:  no policy attached; the grant's booleans allow tools by kind.
//   policy: the policy's allow list decides; the role cap still applies.
//   none:   the instance isn't reachable through this connection.
export type InstanceAccess =
  | { mode: "none" }
  | { mode: "kinds"; perm: Perm }
  | { mode: "policy"; policy: PolicySummary; roleCap: Perm };

export function toolAllowed(access: InstanceAccess, tool: { name: string; kind: string }): boolean {
  if (access.mode === "none") return false;
  if (access.mode === "kinds") return Boolean(access.perm[tool.kind as Kind]);
  return Boolean(access.roleCap[tool.kind as Kind]) && access.policy.allow.includes(tool.name);
}

function kindsText(perm: Perm): string {
  const kinds = ["read", "create", "edit", "delete"] as const;
  const yes = kinds.filter((k) => perm[k]);
  const no = kinds.filter((k) => !perm[k]);
  if (yes.length === 0) return "Nothing allowed on this instance through this connection.";
  return `Allowed: ${yes.join(", ")}.${no.length ? ` Not allowed: ${no.join(", ")}.` : ""}`;
}

// One line for the model: what this instance allows.
export function accessSummary(access: InstanceAccess): string {
  if (access.mode === "none") return "Not reachable through this connection.";
  if (access.mode === "kinds") return kindsText(access.perm);
  const p = access.policy;
  const base = p.description || `Allows ${p.allow.length} tool${p.allow.length === 1 ? "" : "s"}; everything else is denied.`;
  const capped = (["create", "edit", "delete"] as const).filter((k) => !access.roleCap[k]);
  return capped.length ? `${base} Your role can't ${capped.join(", ")}.` : base;
}

type PolicyRow = typeof policy.$inferSelect;

function toSummary(p: PolicyRow, namespace: string, integrationSlug: string): PolicySummary {
  return {
    id: p.id,
    canonical: toPolicyCanonical(namespace, integrationSlug, p.name),
    name: p.name,
    description: p.description,
    allow: p.allow ?? [],
    specRelease: p.specRelease,
    version: p.version,
    namespace,
    integrationSlug,
  };
}

// Fresh on every call: a policy edited or detached mid-conversation takes
// effect on the next call.
export async function accessFor(connectionId: string, instanceId: string, role: CallerRole): Promise<InstanceAccess> {
  const [row] = await db
    .select({ g: connectionGrant, p: policy, ns: organization.slug, slug: integration.slug })
    .from(connectionGrant)
    .leftJoin(policy, eq(policy.id, connectionGrant.policyId))
    .leftJoin(organization, eq(organization.id, policy.organizationId))
    .leftJoin(integration, eq(integration.id, policy.integrationId))
    .where(and(eq(connectionGrant.connectionId, connectionId), eq(connectionGrant.instanceId, instanceId)))
    .limit(1);
  if (!row) return { mode: "none" };
  if (row.p && row.ns && row.slug) return { mode: "policy", policy: toSummary(row.p, row.ns, row.slug), roleCap: ROLE_CAP[role] };
  return { mode: "kinds", perm: intersect(grantToPerm(row.g), ROLE_CAP[role]) };
}

export function isNone(access: InstanceAccess) {
  return access.mode === "none";
}

export { NONE };

// The release of an integration's newest imported spec, if any.
export async function latestRelease(integrationId: string): Promise<string | null> {
  const [row] = await db
    .select({ release: integrationApiSpecSnapshot.release })
    .from(integrationApiSpecSnapshot)
    .where(eq(integrationApiSpecSnapshot.integrationId, integrationId))
    .orderBy(desc(integrationApiSpecSnapshot.importedAt))
    .limit(1);
  return row?.release ?? null;
}

// The live tools of an integration, for the policy editor and warnings.
export async function integrationTools(integrationId: string) {
  return db
    .select({ name: apiEndpoint.name, kind: apiEndpoint.kind, summary: apiEndpoint.summary, path: apiEndpoint.path })
    .from(apiEndpoint)
    .where(and(eq(apiEndpoint.integrationId, integrationId), isNull(apiEndpoint.removedAt)))
    .orderBy(asc(apiEndpoint.kind), asc(apiEndpoint.name));
}

// Pegged to a spec: what changed since the allow list was reviewed. Warns,
// never blocks. `missing` are listed tools the integration no longer has;
// `notListed` are live tools the policy doesn't mention (denied until
// added).
export async function policyWarnings(p: { allow: string[]; specRelease: string | null }, integrationId: string) {
  const [tools, release] = await Promise.all([integrationTools(integrationId), latestRelease(integrationId)]);
  const live = new Set(tools.map((t) => t.name));
  const allow = new Set(p.allow);
  return {
    missing: p.allow.filter((n) => !live.has(n)),
    notListed: tools.filter((t) => !allow.has(t.name)).length,
    specChanged: Boolean(release && p.specRelease && release !== p.specRelease),
    currentRelease: release,
  };
}

export type PolicyListItem = PolicySummary & {
  integrationId: string;
  integrationTitle: string;
  visibility: string;
  inUse: number;
  copiedFromName: string | null;
  copiedFromVersion: number | null;
  updatedAt: Date;
};

// A namespace's own policies, with how many connection grants use each.
export async function listPolicies(organizationId: string): Promise<PolicyListItem[]> {
  const rows = await db
    .select({
      p: policy,
      ns: organization.slug,
      slug: integration.slug,
      title: integration.name,
      inUse: sql<number>`(select count(*)::int from ${connectionGrant} where ${connectionGrant.policyId} = ${policy.id})`,
    })
    .from(policy)
    .innerJoin(organization, eq(organization.id, policy.organizationId))
    .innerJoin(integration, eq(integration.id, policy.integrationId))
    .where(eq(policy.organizationId, organizationId))
    .orderBy(asc(integration.slug), asc(policy.name));
  return rows.map((r) => ({
    ...toSummary(r.p, r.ns, r.slug),
    integrationId: r.p.integrationId,
    integrationTitle: r.title,
    visibility: r.p.visibility,
    inUse: r.inUse,
    copiedFromName: r.p.copiedFromName,
    copiedFromVersion: r.p.copiedFromVersion,
    updatedAt: r.p.updatedAt,
  }));
}

// A namespace's public policies, for its page and for copying.
export async function listPublicPolicies(organizationId: string) {
  return (await listPolicies(organizationId)).filter((p) => p.visibility === "public");
}

// Policies a connection in this workspace can attach to an instance of
// this integration: the namespace's own, made available to the workspace,
// for an integration with the same slug (same spec, any importer).
export async function pickablePolicies(workspaceId: string, integrationSlug: string): Promise<PolicySummary[]> {
  const rows = await db
    .select({ p: policy, ns: organization.slug, slug: integration.slug })
    .from(workspacePolicy)
    .innerJoin(policy, eq(policy.id, workspacePolicy.policyId))
    .innerJoin(workspace, eq(workspace.id, workspacePolicy.workspaceId))
    .innerJoin(organization, eq(organization.id, policy.organizationId))
    .innerJoin(integration, eq(integration.id, policy.integrationId))
    .where(and(eq(workspacePolicy.workspaceId, workspaceId), eq(policy.organizationId, workspace.organizationId), eq(integration.slug, integrationSlug)))
    .orderBy(asc(policy.name));
  return rows.map((r) => toSummary(r.p, r.ns, r.slug));
}

export async function getPolicy(id: string) {
  const [row] = await db
    .select({ p: policy, ns: organization.slug, slug: integration.slug, title: integration.name })
    .from(policy)
    .innerJoin(organization, eq(organization.id, policy.organizationId))
    .innerJoin(integration, eq(integration.id, policy.integrationId))
    .where(eq(policy.id, id))
    .limit(1);
  if (!row) return null;
  return { row: row.p, summary: toSummary(row.p, row.ns, row.slug), integrationTitle: row.title };
}

export async function findPolicyByPage(namespace: string, integrationSlug: string, name: string) {
  const [row] = await db
    .select({ id: policy.id })
    .from(policy)
    .innerJoin(organization, eq(organization.id, policy.organizationId))
    .innerJoin(integration, eq(integration.id, policy.integrationId))
    .where(and(eq(organization.slug, namespace), eq(integration.slug, integrationSlug), eq(policy.name, name)))
    .limit(1);
  return row ? getPolicy(row.id) : null;
}

export async function policyRevisions(policyId: string) {
  return db
    .select({
      version: policyRevision.version,
      description: policyRevision.description,
      allow: policyRevision.allow,
      createdAt: policyRevision.createdAt,
      byName: user.name,
      byHandle: sql<string | null>`(select ${organization.slug} from ${organization} where ${organization.ownerUserId} = ${user.id} and ${organization.kind} = 'personal' limit 1)`,
    })
    .from(policyRevision)
    .leftJoin(user, eq(user.id, policyRevision.changedByUserId))
    .where(eq(policyRevision.policyId, policyId))
    .orderBy(desc(policyRevision.version));
}

// The person's @handle: their personal namespace. Never their email.
export async function handleOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(and(eq(organization.ownerUserId, userId), eq(organization.kind, "personal")))
    .limit(1);
  return row ? `@${row.slug}` : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Creates or edits a policy. Every save bumps the version and records a
// revision. Only operationIds the integration actually has are kept.
export async function savePolicy(params: {
  id?: string;
  organizationId: string;
  integrationId: string;
  name: string;
  description: string;
  allow: string[];
  visibility: "public" | "private";
  userId: string;
  workspaceIds: string[];
}): Promise<string> {
  const tools = await integrationTools(params.integrationId);
  const live = new Set(tools.map((t) => t.name));
  const allow = [...new Set(params.allow)].filter((n) => live.has(n)).sort();
  const release = await latestRelease(params.integrationId);

  return db.transaction(async (tx) => {
    let id = params.id;
    let version = 1;
    if (id) {
      const existing = await tx.query.policy.findFirst({ where: and(eq(policy.id, id), eq(policy.organizationId, params.organizationId)) });
      if (!existing) throw new Error("policy not found");
      version = existing.version + 1;
      await tx
        .update(policy)
        .set({
          name: params.name,
          description: params.description,
          allow,
          specRelease: release,
          version,
          visibility: params.visibility,
          updatedByUserId: params.userId,
          updatedAt: new Date(),
        })
        .where(eq(policy.id, id));
    } else {
      id = newId();
      await tx.insert(policy).values({
        id,
        organizationId: params.organizationId,
        integrationId: params.integrationId,
        name: params.name,
        description: params.description,
        allow,
        specRelease: release,
        version,
        visibility: params.visibility,
        createdByUserId: params.userId,
        updatedByUserId: params.userId,
      });
    }
    await tx.insert(policyRevision).values({
      id: newId(),
      policyId: id,
      version,
      description: params.description,
      allow,
      specRelease: release,
      changedByUserId: params.userId,
    });
    await setPolicyWorkspaces(tx, id, params.organizationId, params.workspaceIds);
    return id;
  });
}

// Which of the namespace's workspaces may pick this policy. A workspace
// whose connections still use it keeps it.
async function setPolicyWorkspaces(tx: Tx, policyId: string, organizationId: string, workspaceIds: string[]) {
  const own = (await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, organizationId))).map((w) => w.id);
  const inUse = (
    await tx
      .selectDistinct({ id: instance.workspaceId })
      .from(connectionGrant)
      .innerJoin(instance, eq(instance.id, connectionGrant.instanceId))
      .where(eq(connectionGrant.policyId, policyId))
  ).map((r) => r.id);
  const wanted = new Set([...workspaceIds.filter((w) => own.includes(w)), ...inUse]);
  await tx.delete(workspacePolicy).where(eq(workspacePolicy.policyId, policyId));
  if (wanted.size) {
    await tx.insert(workspacePolicy).values([...wanted].map((w) => ({ workspaceId: w, policyId })));
  }
}

export async function policyWorkspaceIds(policyId: string): Promise<string[]> {
  return (await db.select({ id: workspacePolicy.workspaceId }).from(workspacePolicy).where(eq(workspacePolicy.policyId, policyId))).map(
    (r) => r.id,
  );
}

// Copy on install: the copy is the installer's own policy, with a note of
// where it came from. It never changes when the source does.
export async function copyPolicy(params: { sourceId: string; organizationId: string; userId: string; workspaceId: string; name?: string }) {
  const src = await getPolicy(params.sourceId);
  if (!src) throw new Error("policy not found");
  const taken = await db
    .select({ name: policy.name })
    .from(policy)
    .where(and(eq(policy.organizationId, params.organizationId), eq(policy.integrationId, src.row.integrationId)));
  let name = params.name ?? src.row.name;
  for (let i = 2; taken.some((t) => t.name === name); i++) name = `${params.name ?? src.row.name}_${i}`;
  const id = await savePolicy({
    organizationId: params.organizationId,
    integrationId: src.row.integrationId,
    name,
    description: src.row.description,
    allow: src.row.allow ?? [],
    visibility: "private",
    userId: params.userId,
    workspaceIds: [params.workspaceId],
  });
  await db
    .update(policy)
    .set({ copiedFromPolicyId: src.row.id, copiedFromName: src.summary.canonical, copiedFromVersion: src.row.version })
    .where(eq(policy.id, id));
  return id;
}

// "Update available": the source has a newer version than the copy came
// from. Null when the copy is current or the source is gone.
export async function sourceUpdate(p: { copiedFromPolicyId: string | null; copiedFromVersion: number | null }) {
  if (!p.copiedFromPolicyId) return null;
  const src = await getPolicy(p.copiedFromPolicyId);
  if (!src || src.row.version <= (p.copiedFromVersion ?? 0)) return null;
  return src;
}

// Brings a copy up to its source's latest allow list and description. The
// copy stays the installer's own: a new version of it, with a revision.
export async function updateCopyFromSource(copyId: string, organizationId: string, userId: string) {
  const copy = await getPolicy(copyId);
  if (!copy || copy.row.organizationId !== organizationId) throw new Error("policy not found");
  const src = await sourceUpdate(copy.row);
  if (!src) return;
  await savePolicy({
    id: copy.row.id,
    organizationId,
    integrationId: copy.row.integrationId,
    name: copy.row.name,
    description: src.row.description,
    allow: src.row.allow ?? [],
    visibility: copy.row.visibility as "public" | "private",
    userId,
    workspaceIds: await policyWorkspaceIds(copy.row.id),
  });
  await db.update(policy).set({ copiedFromVersion: src.row.version }).where(eq(policy.id, copy.row.id));
}

// Integrations a namespace can write policies for: its own, and the ones
// its workspaces' instances use.
export async function policyIntegrations(organizationId: string) {
  const viaInstances = db
    .selectDistinct({ id: integration.id })
    .from(integration)
    .innerJoin(instance, eq(instance.integrationId, integration.id))
    .innerJoin(workspace, eq(workspace.id, instance.workspaceId))
    .where(eq(workspace.organizationId, organizationId));
  const ids = new Set([
    ...(await viaInstances).map((r) => r.id),
    ...(await db.select({ id: integration.id }).from(integration).where(eq(integration.organizationId, organizationId))).map((r) => r.id),
  ]);
  if (!ids.size) return [];
  return db
    .select({ id: integration.id, slug: integration.slug, title: integration.name, ns: organization.slug })
    .from(integration)
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(inArray(integration.id, [...ids]))
    .orderBy(asc(integration.slug));
}
