"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { connectionGrant, policy, policyRevision } from "../../db/schema";
import { requireOrgOwner, requireWorkspace } from "../guard";
import { copyPolicy, getPolicy, policyIntegrations, policyWorkspaceIds, savePolicy, updateCopyFromSource } from "../policies";
import { isValidSegment, toPolicyName } from "../tool-names";

// Only the namespace's owners write policies, because a policy is
// published under the namespace's handle. In a personal namespace that is
// the one person who owns it.

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function savePolicyFormAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() || undefined;
  const integrationId = formData.get("integration_id")?.toString() ?? "";
  const name = toPolicyName(formData.get("name")?.toString() ?? "");
  const description = (formData.get("description")?.toString() ?? "").trim().slice(0, 280);
  const visibility = formData.get("visibility")?.toString() === "public" ? "public" : "private";
  const allow = formData.getAll("allow").map((v) => v.toString());
  const workspaceIds = formData.getAll("workspace").map((v) => v.toString());
  const back = id ? `/app/policies/${id}` : `/app/policies/new?integration=${encodeURIComponent(integrationId)}`;

  if (!name || !isValidSegment(name)) redirect(`${back}${back.includes("?") ? "&" : "?"}error=name`);
  const allowedIntegrations = await policyIntegrations(ws.organizationId);
  if (!allowedIntegrations.some((i) => i.id === integrationId)) redirect("/app/policies?error=integration");
  if (id) {
    const existing = await getPolicy(id);
    if (!existing || existing.row.organizationId !== ws.organizationId) redirect("/app/policies");
  }

  let saved: string;
  try {
    saved = await savePolicy({ id, organizationId: ws.organizationId, integrationId, name, description, allow, visibility, userId: user.id, workspaceIds });
  } catch (err) {
    if (pgCode(err) === "23505") redirect(`${back}${back.includes("?") ? "&" : "?"}error=taken`);
    throw err;
  }
  revalidatePath("/app/policies");
  redirect(`/app/policies/${saved}?saved=1`);
}

// A policy still attached to a connection can't be deleted (the foreign
// key restricts it too); detach it in Connections first.
export async function deletePolicyAction(formData: FormData) {
  const { ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() ?? "";
  const existing = await getPolicy(id);
  if (!existing || existing.row.organizationId !== ws.organizationId) redirect("/app/policies");
  const [used] = await db.select({ id: connectionGrant.id }).from(connectionGrant).where(eq(connectionGrant.policyId, id)).limit(1);
  if (used) redirect(`/app/policies/${id}?error=in_use`);
  await db.delete(policy).where(eq(policy.id, id));
  revalidatePath("/app/policies");
  redirect("/app/policies?deleted=1");
}

// Copy on install, into the namespace you're working in.
export async function copyPolicyAction(formData: FormData) {
  const { user, ws } = await requireWorkspace();
  const sourceId = formData.get("policy_id")?.toString() ?? "";
  if (ws.orgRole !== "owner") redirect(`/app/policies?error=owner_only`);
  const src = await getPolicy(sourceId);
  if (!src || (src.row.visibility !== "public" && src.row.organizationId !== ws.organizationId)) redirect("/app/policies");
  const id = await copyPolicy({ sourceId, organizationId: ws.organizationId, userId: user.id, workspaceId: ws.workspaceId });
  revalidatePath("/app/policies");
  redirect(`/app/policies/${id}?copied=1`);
}

export async function updateCopyAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() ?? "";
  await updateCopyFromSource(id, ws.organizationId, user.id);
  revalidatePath(`/app/policies/${id}`);
  redirect(`/app/policies/${id}?saved=1`);
}

// Undo: saves an older revision's list and description as a new version.
export async function restoreRevisionAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() ?? "";
  const version = Number(formData.get("version"));
  const existing = await getPolicy(id);
  if (!existing || existing.row.organizationId !== ws.organizationId) redirect("/app/policies");
  const rev = await db.query.policyRevision.findFirst({ where: and(eq(policyRevision.policyId, id), eq(policyRevision.version, version)) });
  if (!rev) redirect(`/app/policies/${id}`);
  await savePolicy({
    id,
    organizationId: ws.organizationId,
    integrationId: existing.row.integrationId,
    name: existing.row.name,
    description: rev.description,
    allow: rev.allow ?? [],
    visibility: existing.row.visibility as "public" | "private",
    userId: user.id,
    workspaceIds: await policyWorkspaceIds(id),
  });
  revalidatePath(`/app/policies/${id}`);
  redirect(`/app/policies/${id}?saved=1`);
}
