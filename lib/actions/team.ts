"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { invitation, membership, oauthGrant, organization, user as userTable, workspace, workspaceMember } from "../../db/schema";
import { publicUrl } from "../env";
import { requireOrgOwner, requireOwner, requireUser } from "../guard";
import { newId } from "../id";
import { INVITE_TTL_MS, findOpenInvite } from "../invites";
import { randomToken, sha256Hex } from "../oauth-crypto";
import { CURRENT_ORG_COOKIE, CURRENT_WS_COOKIE, type WsRole } from "../workspace";

export type InviteState = { error?: string; link?: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WS_ROLES: WsRole[] = ["admin", "member", "viewer"];

function wsRole(raw: FormDataEntryValue | null): WsRole {
  const v = raw?.toString() as WsRole;
  return WS_ROLES.includes(v) ? v : "member";
}

// Invites a person to this workspace with a workspace role. They join the
// org as a member (or owner, if an org owner ticks that). There's no email
// sending yet, so the admin gets the link; only its hash is stored.
//
// In a personal namespace (@gaita) only its owner invites, and nobody else
// can become an owner: others only ever help inside a workspace. The handle
// is a person's name, so everything above the workspace stays theirs.
export async function createInviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { user, ws } = await requireOwner();
  const personal = ws.organizationKind === "personal";
  if (personal && ws.orgRole !== "owner") return { error: "Only the owner of this personal namespace can invite people." };
  const email = (formData.get("email")?.toString() ?? "").trim().toLowerCase();
  const role = wsRole(formData.get("ws_role"));
  const orgOwner = !personal && formData.get("org_owner")?.toString() === "on" && ws.orgRole === "owner";

  if (!EMAIL.test(email)) return { error: "Enter the Google account email of the person you're inviting." };
  if (email === user.email.toLowerCase()) return { error: "That's you. You're already here." };

  const [existing] = await db
    .select({ userId: userTable.id })
    .from(membership)
    .innerJoin(userTable, eq(userTable.id, membership.userId))
    .where(and(eq(membership.organizationId, ws.organizationId), eq(userTable.email, email)))
    .limit(1);
  if (existing) return { error: `${email} is already in this org. Add them below instead.` };

  await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitation.organizationId, ws.organizationId),
        eq(invitation.email, email),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
      ),
    );

  const token = randomToken();
  await db.insert(invitation).values({
    id: newId(),
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    workspaceRole: role,
    email,
    role: orgOwner ? "owner" : "member",
    tokenHash: sha256Hex(token),
    invitedByUserId: user.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  revalidatePath("/app/team");
  return { link: `${publicUrl()}/invite/${token}`, email };
}

export async function revokeInviteAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("invite_id")?.toString() ?? "";
  await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, ws.organizationId)));
  revalidatePath("/app/team");
}

// Adds someone already in the org to this workspace.
export async function addToWorkspaceAction(formData: FormData) {
  const { ws } = await requireOwner();
  const userId = formData.get("user_id")?.toString() ?? "";
  const role = wsRole(formData.get("ws_role"));
  const inOrg = await db.query.membership.findFirst({
    where: and(eq(membership.organizationId, ws.organizationId), eq(membership.userId, userId)),
  });
  if (!inOrg) return;
  await db
    .insert(workspaceMember)
    .values({ id: newId(), workspaceId: ws.workspaceId, userId, role })
    .onConflictDoUpdate({ target: [workspaceMember.workspaceId, workspaceMember.userId], set: { role } });
  revalidatePath("/app/team");
}

export async function changeWorkspaceRoleAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("member_id")?.toString() ?? "";
  const role = wsRole(formData.get("ws_role"));
  await db
    .update(workspaceMember)
    .set({ role })
    .where(and(eq(workspaceMember.id, id), eq(workspaceMember.workspaceId, ws.workspaceId)));
  revalidatePath("/app/team");
}

// Removing someone from a workspace also disconnects every agent they
// connected here, so access ends now rather than at the next token expiry.
// Their org membership (and other workspaces) stay.
export async function removeFromWorkspaceAction(formData: FormData) {
  const { user, ws } = await requireOwner();
  const id = formData.get("member_id")?.toString() ?? "";
  const row = await db.query.workspaceMember.findFirst({
    where: and(eq(workspaceMember.id, id), eq(workspaceMember.workspaceId, ws.workspaceId)),
  });
  if (!row) return;
  if (row.userId === user.id) redirect("/app/team?error=self");
  await db.transaction(async (tx) => {
    await tx
      .update(oauthGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthGrant.workspaceId, ws.workspaceId), eq(oauthGrant.userId, row.userId), isNull(oauthGrant.revokedAt)));
    await tx.delete(workspaceMember).where(eq(workspaceMember.id, row.id));
  });
  revalidatePath("/app/team");
}

async function ownerCount(organizationId: string) {
  const rows = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.role, "owner")));
  return rows.length;
}

// Org owners are admins of every workspace in the org.
export async function changeOrgRoleAction(formData: FormData) {
  const { ws } = await requireOrgOwner();
  const membershipId = formData.get("membership_id")?.toString() ?? "";
  const role = formData.get("role")?.toString() === "owner" ? "owner" : "member";
  const row = await db.query.membership.findFirst({
    where: and(eq(membership.id, membershipId), eq(membership.organizationId, ws.organizationId)),
  });
  if (!row) return;
  // A personal namespace has exactly one owner, forever.
  if (ws.organizationKind === "personal" && role === "owner") redirect("/app/team?error=personal");
  if (row.role === "owner" && role === "member" && (await ownerCount(ws.organizationId)) <= 1) {
    redirect("/app/team?error=last_owner");
  }
  await db.update(membership).set({ role }).where(eq(membership.id, row.id));
  revalidatePath("/app", "layout");
}

// Removes someone from the whole org: every workspace, every agent.
export async function removeFromOrgAction(formData: FormData) {
  const { user, ws } = await requireOrgOwner();
  const membershipId = formData.get("membership_id")?.toString() ?? "";
  const row = await db.query.membership.findFirst({
    where: and(eq(membership.id, membershipId), eq(membership.organizationId, ws.organizationId)),
  });
  if (!row) return;
  if (row.userId === user.id) redirect("/app/team?error=self");
  const org = await db.query.organization.findFirst({ where: eq(organization.id, ws.organizationId) });
  if (org?.ownerUserId === row.userId) redirect("/app/team?error=creator");

  const wsIds = (await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, ws.organizationId))).map(
    (w) => w.id,
  );
  await db.transaction(async (tx) => {
    await tx
      .update(oauthGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthGrant.organizationId, ws.organizationId), eq(oauthGrant.userId, row.userId), isNull(oauthGrant.revokedAt)));
    for (const id of wsIds) {
      await tx.delete(workspaceMember).where(and(eq(workspaceMember.workspaceId, id), eq(workspaceMember.userId, row.userId)));
    }
    await tx.delete(membership).where(eq(membership.id, row.id));
  });
  revalidatePath("/app/team");
}

// The signed-in Google account must match the address the invite was sent
// to; a forwarded link is useless to anyone else.
export async function acceptInviteAction(formData: FormData) {
  const user = await requireUser();
  const token = formData.get("token")?.toString() ?? "";
  const invite = await findOpenInvite(token);
  if (!invite) redirect(`/invite/${encodeURIComponent(token)}`);
  if (invite.email !== user.email.toLowerCase()) redirect(`/invite/${encodeURIComponent(token)}?error=wrong_account`);

  let workspaceId = invite.workspaceId;
  if (!workspaceId) {
    const [first] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, invite.organizationId)).limit(1);
    workspaceId = first?.id ?? null;
  }

  await db.transaction(async (tx) => {
    const existing = await tx.query.membership.findFirst({
      where: and(eq(membership.organizationId, invite.organizationId), eq(membership.userId, user.id)),
    });
    if (!existing) {
      await tx.insert(membership).values({ id: newId(), userId: user.id, organizationId: invite.organizationId, role: invite.role });
    }
    if (workspaceId && invite.role !== "owner") {
      await tx
        .insert(workspaceMember)
        .values({ id: newId(), workspaceId, userId: user.id, role: invite.workspaceRole })
        .onConflictDoNothing();
    }
    await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, invite.id));
  });

  const jar = await cookies();
  const opts = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: publicUrl().startsWith("https://"), maxAge: 60 * 60 * 24 * 365 };
  jar.set(CURRENT_ORG_COOKIE, invite.organizationId, opts);
  if (workspaceId) jar.set(CURRENT_WS_COOKIE, workspaceId, opts);
  redirect("/app?joined=1");
}
