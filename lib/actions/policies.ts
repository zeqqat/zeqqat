"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { connectionGrant, policy } from "../../db/schema";
import { hereAccount, requireOrgOwner, requireWorkspace } from "../guard";
import { copyPolicy, getPolicy, policyIntegrations, policyWorkspaceIds, savePolicy, updateCopyFromSource } from "../policies";
import { isValidSegment, toPolicyName } from "../tool-names";

// Only the namespace's owners write policies, because a policy is
// published under the namespace's handle. In a personal namespace that is
// the one person who owns it.

// Where this policy's pages live: the account's (/<username>/policies) or,
// when the page was opened from a workspace, that workspace's
// (/<username>/<workspace>/policies). The form says which; anything that
// isn't one of this account's own paths falls back to the account's.
function policiesBase(formData: FormData, orgSlug: string, accountBase: string): string {
  const v = formData.get("policies_base")?.toString() ?? "";
  return /^\/[a-z0-9_]+\/[a-z0-9_-]+\/policies$/.test(v) && v.startsWith(`/${orgSlug}/`) ? v : `${accountBase}/policies`;
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function savePolicyFormAction(formData: FormData) {
  const base = await hereAccount();
  const { user, acct: ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() || undefined;
  const integrationId = formData.get("integration_id")?.toString() ?? "";
  const name = toPolicyName(formData.get("name")?.toString() ?? "");
  const description = (formData.get("description")?.toString() ?? "").trim().slice(0, 280);
  const visibility = formData.get("visibility")?.toString() === "public" ? "public" : "private";
  const allow = formData.getAll("allow").map((v) => v.toString());
  const workspaceIds = formData.getAll("workspace").map((v) => v.toString());
  const back = id ? `${base}/policies/${id}?tab=tools` : `${base}/policies/new`;

  if (!name || !isValidSegment(name)) redirect(`${back}${back.includes("?") ? "&" : "?"}error=name`);
  const allowedIntegrations = await policyIntegrations(ws.organizationId);
  if (!allowedIntegrations.some((i) => i.id === integrationId)) redirect(`${base}/policies?error=integration`);
  if (id) {
    const existing = await getPolicy(id);
    if (!existing || existing.row.organizationId !== ws.organizationId) redirect(`${base}/policies`);
  }

  let saved: string;
  try {
    saved = await savePolicy({ id, organizationId: ws.organizationId, integrationId, name, description, allow, visibility, userId: user.id, workspaceIds });
  } catch (err) {
    if (pgCode(err) === "23505") redirect(`${back}${back.includes("?") ? "&" : "?"}error=taken`);
    throw err;
  }
  revalidatePath(`${base}/policies`);
  redirect(`${base}/policies/${saved}?tab=${id ? "tools" : "map"}&saved=1`);
}

// A policy still attached to a connection can't be deleted (the foreign
// key restricts it too); detach it in Connections first.
export async function deletePolicyAction(formData: FormData) {
  const base = await hereAccount();
  const { acct: ws } = await requireOrgOwner();
  const list = policiesBase(formData, ws.organizationSlug, base);
  const id = formData.get("policy_id")?.toString() ?? "";
  const existing = await getPolicy(id);
  if (!existing || existing.row.organizationId !== ws.organizationId) redirect(`${list}`);
  const [used] = await db.select({ id: connectionGrant.id }).from(connectionGrant).where(eq(connectionGrant.policyId, id)).limit(1);
  if (used) redirect(`${list}/${id}?tab=manage&error=in_use`);
  await db.delete(policy).where(eq(policy.id, id));
  revalidatePath(`${list}`);
  redirect(`${list}?deleted=1`);
}

// Copy on install, into the namespace you're working in.
export async function copyPolicyAction(formData: FormData) {
  const base = await hereAccount();
  const { user, ws } = await requireWorkspace();
  const sourceId = formData.get("policy_id")?.toString() ?? "";
  if (ws.orgRole !== "owner") redirect(`${base}/policies?error=owner_only`);
  const src = await getPolicy(sourceId);
  if (!src || (src.row.visibility !== "public" && src.row.organizationId !== ws.organizationId)) redirect(`${base}/policies`);
  const id = await copyPolicy({ sourceId, organizationId: ws.organizationId, userId: user.id, workspaceId: ws.workspaceId });
  revalidatePath(`${base}/policies`);
  redirect(`${base}/policies/${id}?copied=1`);
}

export async function updateCopyAction(formData: FormData) {
  const base = await hereAccount();
  const { user, acct: ws } = await requireOrgOwner();
  const id = formData.get("policy_id")?.toString() ?? "";
  await updateCopyFromSource(id, ws.organizationId, user.id);
  revalidatePath(`${base}/policies/${id}`);
  redirect(`${base}/policies/${id}?saved=1`);
}

// The MCP tools tab saves the allow list alone; everything else stays.
export async function savePolicyAllowAction(formData: FormData) {
  const base = await hereAccount();
  const { user, acct: ws } = await requireOrgOwner();
  const list = policiesBase(formData, ws.organizationSlug, base);
  const id = formData.get("policy_id")?.toString() ?? "";
  const existing = await getPolicy(id);
  if (!existing || existing.row.organizationId !== ws.organizationId) redirect(`${list}`);
  await savePolicy({
    id,
    organizationId: ws.organizationId,
    integrationId: existing.row.integrationId,
    name: existing.row.name,
    description: existing.row.description,
    allow: formData.getAll("allow").map((v) => v.toString()),
    visibility: existing.row.visibility as "public" | "private",
    userId: user.id,
    workspaceIds: await policyWorkspaceIds(id),
  });
  revalidatePath(`${list}/${id}`);
  redirect(`${list}/${id}?tab=tools&saved=1`);
}

// Manage: name, what agents read, public, workspaces. Each form sends only
// its own field; the rest keeps its value.
export async function updatePolicyMetaAction(formData: FormData) {
  const base = await hereAccount();
  const { user, acct: ws } = await requireOrgOwner();
  const list = policiesBase(formData, ws.organizationSlug, base);
  const id = formData.get("policy_id")?.toString() ?? "";
  const existing = await getPolicy(id);
  if (!existing || existing.row.organizationId !== ws.organizationId) redirect(`${list}`);
  const back = `${list}/${id}?tab=manage`;
  const has = (k: string) => formData.has(k);
  const name = has("name") ? toPolicyName(formData.get("name")?.toString() ?? "") : existing.row.name;
  if (!name || !isValidSegment(name)) redirect(`${back}&error=name`);
  const description = has("description") ? (formData.get("description")?.toString() ?? "").trim().slice(0, 280) : existing.row.description;
  const visibility = has("visibility")
    ? formData.get("visibility")?.toString() === "public"
      ? "public"
      : "private"
    : (existing.row.visibility as "public" | "private");
  const workspaceIds = has("workspaces") ? formData.getAll("workspace").map((v) => v.toString()) : await policyWorkspaceIds(id);
  try {
    await savePolicy({
      id,
      organizationId: ws.organizationId,
      integrationId: existing.row.integrationId,
      name,
      description,
      allow: existing.row.allow ?? [],
      visibility,
      userId: user.id,
      workspaceIds,
    });
  } catch (err) {
    if (pgCode(err) === "23505") redirect(`${back}&error=taken`);
    throw err;
  }
  revalidatePath(`${list}`);
  redirect(`${back}&saved=1`);
}
