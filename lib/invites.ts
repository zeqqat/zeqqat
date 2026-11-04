import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { invitation, organization, user, workspace } from "../db/schema";
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
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row
    ? { ...row, role: row.role as "owner" | "member", workspaceRole: row.workspaceRole as "admin" | "member" | "viewer" }
    : null;
}
