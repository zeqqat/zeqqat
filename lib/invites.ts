import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { connection, connectionMember, invitation, membership, organization, user, workspace, workspaceMember } from "../db/schema";
import { newId } from "./id";
import { sha256Hex } from "./oauth-crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// An invite that can still be accepted: not accepted, not revoked, not
// expired. Looked up by the hash of the link's token, never the token.
export async function findOpenInvite(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      workspaceId: invitation.workspaceId,
      connectionId: invitation.connectionId,
      workspaceRole: invitation.workspaceRole,
      workspaceName: workspace.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organizationName: organization.displayName,
      inviterName: user.name,
      inviterEmail: user.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.invitedByUserId))
    .leftJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .where(
      and(
        eq(invitation.tokenHash, sha256Hex(token)),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        isNull(invitation.declinedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row
    ? { ...row, role: row.role as "owner" | "member", workspaceRole: row.workspaceRole as "admin" | "member" | "viewer" }
    : null;
}

// The same, by id: for the invite page Zeqqat opens itself when an invite
// is waiting for the signed-in person's email (no link involved).
export async function findOpenInviteById(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      workspaceId: invitation.workspaceId,
      connectionId: invitation.connectionId,
      workspaceRole: invitation.workspaceRole,
      workspaceName: workspace.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organizationName: organization.displayName,
      inviterName: user.name,
      inviterEmail: user.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.invitedByUserId))
    .leftJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .where(
      and(
        eq(invitation.id, id),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        isNull(invitation.declinedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row
    ? { ...row, role: row.role as "owner" | "member", workspaceRole: row.workspaceRole as "admin" | "member" | "viewer" }
    : null;
}

// Accepting an invite: the person joins the organization and the
// workspace it names (or the organization's first), and goes on the MCP
// URL it names (or the workspace's first members-only one). Returns the
// workspace. Shared by the Join button and, on a self-hosted install,
// signing up through the link (which counts as accepting).
export async function joinInvite(
  userId: string,
  invite: { id: string; organizationId: string; workspaceId: string | null; role: "owner" | "member"; workspaceRole: string },
): Promise<string | null> {
  let workspaceId = invite.workspaceId;
  if (!workspaceId) {
    const [first] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, invite.organizationId)).orderBy(asc(workspace.createdAt)).limit(1);
    workspaceId = first?.id ?? null;
  }
  await db.transaction(async (tx) => {
    const existing = await tx.query.membership.findFirst({
      where: and(eq(membership.organizationId, invite.organizationId), eq(membership.userId, userId)),
    });
    if (!existing) {
      await tx.insert(membership).values({ id: newId(), userId, organizationId: invite.organizationId, role: invite.role });
    }
    if (workspaceId && invite.role !== "owner") {
      await tx.insert(workspaceMember).values({ id: newId(), workspaceId, userId, role: invite.workspaceRole }).onConflictDoNothing();
    }
    await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, invite.id));
    const [row] = await tx.select({ connectionId: invitation.connectionId }).from(invitation).where(eq(invitation.id, invite.id));
    let urlId = row?.connectionId ?? null;
    if (!urlId && workspaceId) {
      const [first] = await tx
        .select({ id: connection.id })
        .from(connection)
        .where(and(eq(connection.workspaceId, workspaceId), eq(connection.authMode, "members"), isNull(connection.deletedAt)))
        .orderBy(asc(connection.createdAt))
        .limit(1);
      urlId = first?.id ?? null;
    }
    if (urlId) await tx.insert(connectionMember).values({ connectionId: urlId, userId }).onConflictDoNothing();
  });
  return workspaceId;
}
