"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { invitation, membership, oauthGrant, organization, workspace, workspaceMember } from "../../db/schema";
import { requireWorkspace } from "../guard";
import { newId } from "../id";
import { listUserWorkspaces, type WsRole } from "../workspace";

// The Members pages' actions. Each names the workspace or person it acts on,
// so the same action works from the account's pages and a workspace's.
// Who may do what is checked here, not just by hiding controls:
//   a workspace's members and roles: its admins (account owners are admins
//   everywhere); the account itself (owners, removing people): its owners.

const WS_ROLES: WsRole[] = ["admin", "member", "viewer"];

// Back to the page the form was on, optionally with an error.
function back(formData: FormData, error?: string): never {
  const raw = formData.get("back")?.toString() ?? "/";
  const path = raw.startsWith("/") && !raw.startsWith("//") ? raw.split("?")[0] : "/";
  redirect(error ? `${path}?error=${error}` : path);
}

function done(formData: FormData) {
  const raw = formData.get("back")?.toString() ?? "/";
  revalidatePath(raw.split("?")[0]);
}

async function ctx() {
  const { user, ws } = await requireWorkspace();
  return { user, ws, mine: await listUserWorkspaces(user.id) };
}

async function inAccount(orgId: string, userId: string) {
  return db.query.membership.findFirst({ where: and(eq(membership.organizationId, orgId), eq(membership.userId, userId)) });
}

// Is the caller an admin of this workspace, in the account they're on?
function adminOf(c: Awaited<ReturnType<typeof ctx>>, workspaceId: string) {
  return c.mine.some((w) => w.workspaceId === workspaceId && w.organizationId === c.ws.organizationId && w.wsRole === "admin");
}

async function revokeGrants(where: { workspaceId?: string; organizationId?: string; userId: string }) {
  const conds = [eq(oauthGrant.userId, where.userId), isNull(oauthGrant.revokedAt)];
  if (where.workspaceId) conds.push(eq(oauthGrant.workspaceId, where.workspaceId));
  if (where.organizationId) conds.push(eq(oauthGrant.organizationId, where.organizationId));
  await db.update(oauthGrant).set({ revokedAt: new Date() }).where(and(...conds));
}

// Add someone already in the account to a workspace, change their role
// there, or (role "remove") take them out of it. Removing also disconnects
// every agent they connected in that workspace.
export async function setWorkspaceRoleAction(formData: FormData) {
  const c = await ctx();
  const workspaceId = formData.get("workspace_id")?.toString() ?? "";
  const userId = formData.get("user_id")?.toString() ?? "";
  const role = formData.get("role")?.toString() ?? "";
  if (!adminOf(c, workspaceId)) back(formData, "admin_only");
  const m = await inAccount(c.ws.organizationId, userId);
  if (!m) back(formData);
  if (m.role === "owner") back(formData, "owner_role");
  if (role === "remove") {
    if (userId === c.user.id) back(formData, "self");
    await revokeGrants({ workspaceId, userId });
    await db.delete(workspaceMember).where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)));
  } else {
    if (!WS_ROLES.includes(role as WsRole)) back(formData);
    await db
      .insert(workspaceMember)
      .values({ id: newId(), workspaceId, userId, role })
      .onConflictDoUpdate({ target: [workspaceMember.workspaceId, workspaceMember.userId], set: { role } });
  }
  done(formData);
  const to = formData.get("then")?.toString();
  if (to && to.startsWith("/") && !to.startsWith("//")) redirect(to);
}

// Make someone an owner of the organization, or not. A personal account has
// one owner forever, the person who created @<organization> stays one, and
// there is always at least one owner.
export async function setOwnerAction(formData: FormData) {
  const c = await ctx();
  if (c.ws.orgRole !== "owner") back(formData, "owner_only");
  if (c.ws.organizationKind === "personal") back(formData, "personal");
  const userId = formData.get("user_id")?.toString() ?? "";
  const owner = formData.get("owner")?.toString() === "on";
  const m = await inAccount(c.ws.organizationId, userId);
  if (!m) back(formData);
  if (!owner) {
    const org = await db.query.organization.findFirst({ where: eq(organization.id, c.ws.organizationId) });
    if (org?.ownerUserId === userId) back(formData, "creator");
    const owners = await db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.organizationId, c.ws.organizationId), eq(membership.role, "owner")));
    if (owners.length <= 1) back(formData, "last_owner");
  }
  await db.update(membership).set({ role: owner ? "owner" : "member" }).where(eq(membership.id, m.id));
  revalidatePath(`/${c.ws.organizationSlug}`, "layout");
  done(formData);
}

// Remove someone from the whole account: every workspace, every agent.
export async function removeFromAccountAction(formData: FormData) {
  const c = await ctx();
  if (c.ws.orgRole !== "owner") back(formData, "owner_only");
  const userId = formData.get("user_id")?.toString() ?? "";
  if (userId === c.user.id) back(formData, "self");
  const m = await inAccount(c.ws.organizationId, userId);
  if (!m) back(formData);
  const org = await db.query.organization.findFirst({ where: eq(organization.id, c.ws.organizationId) });
  if (org?.ownerUserId === userId) back(formData, "creator");
  const wsIds = (await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, c.ws.organizationId))).map((w) => w.id);
  await db.transaction(async (tx) => {
    await tx
      .update(oauthGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthGrant.organizationId, c.ws.organizationId), eq(oauthGrant.userId, userId), isNull(oauthGrant.revokedAt)));
    for (const id of wsIds) await tx.delete(workspaceMember).where(and(eq(workspaceMember.workspaceId, id), eq(workspaceMember.userId, userId)));
    await tx.delete(membership).where(eq(membership.id, m.id));
  });
  revalidatePath(`/${c.ws.organizationSlug}`, "layout");
  redirect(`/${c.ws.organizationSlug}/members`);
}

// Revoke an open invite: an owner of the account, or an admin of the
// workspace it invites to.
export async function revokeInviteAction(formData: FormData) {
  const c = await ctx();
  const id = formData.get("invite_id")?.toString() ?? "";
  const inv = await db.query.invitation.findFirst({ where: and(eq(invitation.id, id), eq(invitation.organizationId, c.ws.organizationId)) });
  if (!inv) back(formData);
  if (c.ws.orgRole !== "owner" && !(inv.workspaceId && adminOf(c, inv.workspaceId))) back(formData, "admin_only");
  await db.update(invitation).set({ revokedAt: new Date() }).where(eq(invitation.id, inv.id));
  done(formData);
}
