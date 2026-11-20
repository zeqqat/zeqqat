"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { instance, membership, oauthGrant, oauthToken, organization, workspace } from "../../db/schema";
import { publicUrl } from "../env";
import { hrefIn, requireOrgOwner, requireOwner, requireUser } from "../guard";
import { accountBase, isReservedWorkspaceSlug, wsBase } from "../paths";
import { newId } from "../id";
import { deleteInstances } from "../instance-ops";
import { transferWorkspace } from "../transfer";
import { isReserved, isValidOrgSlug, normalizeSlug } from "../username";
import { heldByOldUsername } from "../username-alias";
import { CURRENT_ORG_COOKIE, CURRENT_WS_COOKIE, listUserWorkspaces } from "../workspace";

async function setCurrent(organizationId: string, workspaceId: string) {
  const jar = await cookies();
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: publicUrl().startsWith("https://"),
    maxAge: 60 * 60 * 24 * 365,
  };
  jar.set(CURRENT_ORG_COOKIE, organizationId, opts);
  jar.set(CURRENT_WS_COOKIE, workspaceId, opts);
}

// Picking an org lands on its first workspace you can open; picking a
// workspace lands on that one. Either way only among workspaces the user
// can already open.
export async function switchWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const wsId = formData.get("workspace_id")?.toString() ?? "";
  const orgId = formData.get("organization_id")?.toString() ?? "";
  const all = await listUserWorkspaces(user.id);
  const target = all.find((w) => w.workspaceId === wsId) ?? all.find((w) => w.organizationId === orgId);
  if (!target) redirect("/app");
  await setCurrent(target.organizationId, target.workspaceId);
  redirect(wsBase(target.organizationSlug, target.workspaceSlug));
}

// The account level (/<username>): an account's workspaces, members and
// settings. Keeps the current workspace if it's in that account, else the
// first one there you can open.
export async function openAccountAction(formData: FormData) {
  const user = await requireUser();
  const orgId = formData.get("organization_id")?.toString() ?? "";
  const all = await listUserWorkspaces(user.id);
  const jar = await cookies();
  const curWs = jar.get(CURRENT_WS_COOKIE)?.value;
  const target = all.find((w) => w.organizationId === orgId && w.workspaceId === curWs) ?? all.find((w) => w.organizationId === orgId);
  if (!target) redirect("/app/org");
  await setCurrent(target.organizationId, target.workspaceId);
  redirect(accountBase(target.organizationSlug));
}

// A workspace's slug is the second part of its pages' URLs
// (/<username>/<workspace>), never part of an MCP URL or tool name.
// Lowercase with hyphens; never a dot, so it can't look like a tool page.
// Org handles follow the org slug rules.
function toSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function pgCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export type FormState = { error?: string };

// A new workspace in the current org, e.g. "Marketing" next to
// "Engineering". Only org owners create them; they're admins of it by
// being org owners, so no member row is needed.
export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ws } = await requireOrgOwner();
  const name = (formData.get("name")?.toString() ?? "").trim();
  const slug = toSlug(name);
  if (!name || !slug) return { error: "Give the workspace a name, for example Marketing." };
  if (isReservedWorkspaceSlug(slug)) return { error: `"${slug}" is the name of an account page. Pick another name.` };
  const id = newId();
  try {
    await db.insert(workspace).values({
      id,
      organizationId: ws.organizationId,
      slug,
      name: name.slice(0, 60),
      // Setup questions are answered at org level already.
      setupCompletedAt: new Date(),
    });
  } catch (err) {
    if (pgCode(err) === "23505") return { error: `This org already has a workspace called "${slug}".` };
    throw err;
  }
  await setCurrent(ws.organizationId, id);
  redirect(wsBase(ws.organizationSlug, slug));
}

// A new organization, owned by whoever creates it, with one workspace.
export async function createOrgAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = (formData.get("name")?.toString() ?? "").trim();
  const slug = normalizeSlug(formData.get("slug")?.toString() || name);
  if (!name) return { error: "Give the org a name." };
  if (!isValidOrgSlug(slug)) return { error: "Use lowercase letters, numbers and underscores for the handle, for example acme_corp." };
  if (isReserved(slug)) return { error: `"${slug}" is reserved. Pick another handle.` };
  if (await heldByOldUsername(slug)) return { error: `The handle @${slug} is taken.` };

  const orgId = newId();
  const wsId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({ id: orgId, slug, displayName: name.slice(0, 60), kind: "organization", ownerUserId: user.id });
      await tx.insert(workspace).values({ id: wsId, organizationId: orgId, slug: "default", name: "Default" });
      await tx.insert(membership).values({ id: newId(), userId: user.id, organizationId: orgId, role: "owner" });
    });
  } catch (err) {
    if (pgCode(err) === "23505") return { error: `The handle @${slug} is taken.` };
    throw err;
  }
  await setCurrent(orgId, wsId);
  redirect(accountBase(slug));
}

export async function renameWorkspaceAction(formData: FormData) {
  const { ws } = await requireOwner();
  const name = (formData.get("name")?.toString() ?? "").trim().slice(0, 60);
  if (!name) redirect(hrefIn(ws, "/settings?error=name"));
  await db.update(workspace).set({ name }).where(eq(workspace.id, ws.workspaceId));
  revalidatePath(hrefIn(ws), "layout");
  redirect(hrefIn(ws, "/settings?saved=1"));
}

// Deletes a workspace and everything in it (instances, keys, connections).
// Never the org's last workspace.
export async function deleteWorkspaceAction(formData: FormData) {
  const { ws } = await requireOrgOwner();
  if (formData.get("confirm")?.toString() !== ws.workspaceSlug) redirect(hrefIn(ws, "/settings?error=confirm"));
  const siblings = await db.select({ id: workspace.id, slug: workspace.slug }).from(workspace).where(eq(workspace.organizationId, ws.organizationId));
  if (siblings.length <= 1) redirect(hrefIn(ws, "/settings?error=last"));
  const ids = (await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, ws.workspaceId))).map((r) => r.id);
  await deleteInstances(ws.workspaceId, ids);
  await db.delete(workspace).where(eq(workspace.id, ws.workspaceId));
  const next = siblings.find((s) => s.id !== ws.workspaceId)!;
  await setCurrent(ws.organizationId, next.id);
  // The workspace's own pages are gone: on to the next one.
  redirect(wsBase(ws.organizationSlug, next.slug) + "/settings?deleted=1");
}

// The "keep using this site or self-host" screen after first setup. Both
// answers are equal; either one just marks the question as answered.
export async function completeSetupAction(formData: FormData) {
  const { ws } = await requireOwner();
  const choice = formData.get("choice")?.toString();
  await db.update(workspace).set({ setupCompletedAt: new Date() }).where(eq(workspace.id, ws.workspaceId));
  redirect(hrefIn(ws, choice === "self-host" ? "/self-host" : ""));
}

// After someone moves to their own Zeqqat: deletes every Dokploy key this
// workspace stored here and disconnects every agent. Their account and its
// activity history stay. Optional, and only ever run on an explicit
// confirmation.
export async function removeHostedDataAction(formData: FormData) {
  const { ws } = await requireOwner();
  if (formData.get("confirm")?.toString() !== "yes") redirect(hrefIn(ws, "/self-host/clean-up?error=confirm"));

  const ids = (await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, ws.workspaceId))).map(
    (r) => r.id,
  );
  await deleteInstances(ws.workspaceId, ids);

  const grants = await db
    .select({ id: oauthGrant.id })
    .from(oauthGrant)
    .where(and(eq(oauthGrant.workspaceId, ws.workspaceId), isNull(oauthGrant.revokedAt)));
  const grantIds = grants.map((g) => g.id);
  if (grantIds.length > 0) {
    const now = new Date();
    await db.update(oauthGrant).set({ revokedAt: now }).where(inArray(oauthGrant.id, grantIds));
    await db.update(oauthToken).set({ revokedAt: now }).where(inArray(oauthToken.grantId, grantIds));
  }

  redirect(hrefIn(ws, `/self-host/clean-up?done=${ids.length}-${grantIds.length}`));
}

// Moves this workspace (instances, connections, policies it uses) from
// your personal namespace into an organization you own. Old connection URLs
// keep working and tell agents the new one.
export async function transferWorkspaceAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  if (ws.organizationKind !== "personal") redirect(hrefIn(ws, "/settings?error=transfer_personal"));
  if (formData.get("confirm")?.toString() !== ws.workspaceSlug) redirect(hrefIn(ws, "/settings?error=confirm_transfer"));
  const target = formData.get("to_org")?.toString() ?? "";
  let movedTo: string | null = null;
  try {
    const { organizationId } = await transferWorkspace({ workspaceId: ws.workspaceId, toOrganizationId: target, userId: user.id });
    await setCurrent(organizationId, ws.workspaceId);
    const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId));
    movedTo = org?.slug ?? null;
  } catch {
    redirect(hrefIn(ws, "/settings?error=transfer"));
  }
  // The workspace now lives under the organization's username.
  redirect(movedTo ? wsBase(movedTo, ws.workspaceSlug) + "/settings?transferred=1" : "/app/settings?transferred=1");
}
