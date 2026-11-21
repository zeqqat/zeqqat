import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { connection, instance, invitation, membership, oauthGrant, organization, user, workspace, workspaceInstance } from "../db/schema";
import { edition } from "./edition";

// Setup: the three steps on a person's own account (/<username>/setup):
// connect a Dokploy, name a workspace (choosing which instances it uses),
// connect an agent. Until it's done, or until they join someone else's
// organization through an invite, Setup is the only page that opens.

export async function personalAccountOf(userId: string) {
  const [own] = await db
    .select({ id: organization.id, slug: organization.slug, setupCompletedAt: organization.setupCompletedAt })
    .from(organization)
    .where(and(eq(organization.ownerUserId, userId), eq(organization.kind, "personal")))
    .limit(1);
  return own ?? null;
}

export async function joinedElsewhere(userId: string, personalId: string | null) {
  const [row] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.userId, userId), personalId ? ne(membership.organizationId, personalId) : undefined))
    .limit(1);
  return !!row;
}

// Where the person is in Setup: 1 until the account has an instance, 2
// until a workspace uses one, 3 until an agent is connected to one of the
// account's workspaces, then done.
export async function setupStep(orgId: string): Promise<{ step: 1 | 2 | 3 | 4; workspaceId: string | null; alias: string | null }> {
  const [inst] = await db.select({ id: instance.id, alias: instance.alias }).from(instance).where(eq(instance.organizationId, orgId)).orderBy(asc(instance.createdAt)).limit(1);
  if (!inst) return { step: 1, workspaceId: null, alias: null };
  const [used] = await db
    .select({ ws: workspaceInstance.workspaceId })
    .from(workspaceInstance)
    .innerJoin(workspace, eq(workspace.id, workspaceInstance.workspaceId))
    .where(eq(workspace.organizationId, orgId))
    .orderBy(asc(workspace.createdAt))
    .limit(1);
  if (!used) return { step: 2, workspaceId: null, alias: inst.alias };
  const [agent] = await db
    .select({ id: oauthGrant.id })
    .from(oauthGrant)
    .where(and(eq(oauthGrant.organizationId, orgId), isNull(oauthGrant.revokedAt)))
    .limit(1);
  return { step: agent ? 4 : 3, workspaceId: used.ws, alias: inst.alias };
}

export async function finishSetup(orgId: string) {
  await db.update(organization).set({ setupCompletedAt: new Date() }).where(and(eq(organization.id, orgId), isNull(organization.setupCompletedAt)));
}

// Open invites sent to this person's email, for organizations they aren't
// in yet. On zeqqat.com the email must be verified first; a self-hosted
// install only creates accounts through an invite link anyway.
export async function pendingInvitesFor(userId: string) {
  const [u] = await db.select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, userId));
  if (!u || (edition() === "cloud" && !u.verified)) return [];
  const mine = (await db.select({ org: membership.organizationId }).from(membership).where(eq(membership.userId, userId))).map((m) => m.org);
  const rows = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      orgSlug: organization.slug,
      orgName: organization.displayName,
      role: invitation.role,
      workspaceRole: invitation.workspaceRole,
      expiresAt: invitation.expiresAt,
      connectionId: invitation.connectionId,
      inviterName: user.name,
      inviterId: invitation.invitedByUserId,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.invitedByUserId))
    .where(
      and(
        eq(invitation.email, u.email.toLowerCase()),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        isNull(invitation.declinedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt));
  return rows.filter((r) => !mine.includes(r.organizationId));
}

// The MCP URL an invite hands out: the one it names, or the workspace's
// first members-only URL.
export async function inviteUrlOf(connectionId: string | null, workspaceId: string | null) {
  if (connectionId) {
    const [c] = await db
      .select({ name: connection.name, shortId: connection.shortId, orgSlug: organization.slug })
      .from(connection)
      .innerJoin(organization, eq(organization.id, connection.organizationId))
      .where(and(eq(connection.id, connectionId), isNull(connection.deletedAt)));
    if (c) return c;
  }
  if (!workspaceId) return null;
  const [c] = await db
    .select({ name: connection.name, shortId: connection.shortId, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(and(eq(connection.workspaceId, workspaceId), eq(connection.authMode, "members"), isNull(connection.deletedAt)))
    .orderBy(asc(connection.createdAt))
    .limit(1);
  return c ?? null;
}
