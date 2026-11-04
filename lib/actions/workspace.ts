"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { instance, membership, oauthGrant, oauthToken, organization, workspace } from "../../db/schema";
import { publicUrl } from "../env";
import { requireOrgOwner, requireOwner, requireUser } from "../guard";
import { newId } from "../id";
import { deleteInstances } from "../instance-ops";
import { transferWorkspace } from "../transfer";
import { isReserved, isValidOrgSlug, normalizeSlug } from "../username";
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
  revalidatePath("/app", "layout");
  redirect("/app");
}

// Workspace slugs are internal only (never in a URL or tool name), so they
// keep their old shape. Org handles follow the org slug rules.
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
  revalidatePath("/app", "layout");
  redirect("/app/settings?created=workspace");
}

// A new organization, owned by whoever creates it, with one workspace.
export async function createOrgAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = (formData.get("name")?.toString() ?? "").trim();
  const slug = normalizeSlug(formData.get("slug")?.toString() || name);
  if (!name) return { error: "Give the org a name." };
  if (!isValidOrgSlug(slug)) return { error: "Use lowercase letters, numbers and underscores for the handle, for example acme_corp." };
  if (isReserved(slug)) return { error: `"${slug}" is reserved. Pick another handle.` };

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
  revalidatePath("/app", "layout");
  redirect("/app?created=org");
}

export async function renameWorkspaceAction(formData: FormData) {
  const { ws } = await requireOwner();
  const name = (formData.get("name")?.toString() ?? "").trim().slice(0, 60);
  if (!name) redirect("/app/settings?error=name");
  await db.update(workspace).set({ name }).where(eq(workspace.id, ws.workspaceId));
  revalidatePath("/app", "layout");
  redirect("/app/settings?saved=1");
}

// Deletes a workspace and everything in it (instances, keys, connections).
// Never the org's last workspace.
export async function deleteWorkspaceAction(formData: FormData) {
  const { ws } = await requireOrgOwner();
  if (formData.get("confirm")?.toString() !== ws.workspaceSlug) redirect("/app/settings?error=confirm");
  const siblings = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, ws.organizationId));
  if (siblings.length <= 1) redirect("/app/settings?error=last");
  const ids = (await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, ws.workspaceId))).map((r) => r.id);
  await deleteInstances(ws.workspaceId, ids);
  await db.delete(workspace).where(eq(workspace.id, ws.workspaceId));
  const next = siblings.find((s) => s.id !== ws.workspaceId)!;
  await setCurrent(ws.organizationId, next.id);
  revalidatePath("/app", "layout");
  redirect("/app/settings?deleted=1");
}

// The "keep using this site or self-host" screen after first setup. Both
// answers are equal; either one just marks the question as answered.
export async function completeSetupAction(formData: FormData) {
  const { ws } = await requireOwner();
  const choice = formData.get("choice")?.toString();
  await db.update(workspace).set({ setupCompletedAt: new Date() }).where(eq(workspace.id, ws.workspaceId));
  revalidatePath("/app", "layout");
  redirect(choice === "self-host" ? "/app/self-host" : "/app");
}

// After someone moves to their own Zeqqat: deletes every Dokploy key this
// workspace stored here and disconnects every agent. Their account and its
// activity history stay. Optional, and only ever run on an explicit
// confirmation.
export async function removeHostedDataAction(formData: FormData) {
  const { ws } = await requireOwner();
  if (formData.get("confirm")?.toString() !== "yes") redirect("/app/self-host/clean-up?error=confirm");

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

  revalidatePath("/app", "layout");
  redirect(`/app/self-host/clean-up?done=${ids.length}-${grantIds.length}`);
}

// Moves this workspace (instances, connections, policies it uses) from
// your personal namespace into an organization you own. Old connection URLs
// keep working and tell agents the new one.
export async function transferWorkspaceAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  if (ws.organizationKind !== "personal") redirect("/app/settings?error=transfer_personal");
  if (formData.get("confirm")?.toString() !== ws.workspaceSlug) redirect("/app/settings?error=confirm_transfer");
  const target = formData.get("to_org")?.toString() ?? "";
  try {
    const { organizationId } = await transferWorkspace({ workspaceId: ws.workspaceId, toOrganizationId: target, userId: user.id });
    await setCurrent(organizationId, ws.workspaceId);
  } catch {
    redirect("/app/settings?error=transfer");
  }
  revalidatePath("/app", "layout");
  redirect("/app/settings?transferred=1");
}
