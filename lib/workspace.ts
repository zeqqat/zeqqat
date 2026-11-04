import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db";
import { instance, membership, oauthGrant, organization, workspace, workspaceMember } from "../db/schema";

// The org and workspace the user is currently looking at. They only select
// among workspaces the user can already open; they never grant access.
export const CURRENT_ORG_COOKIE = "zq_org";
export const CURRENT_WS_COOKIE = "zq_ws";

export type OrgRole = "owner" | "member";
export type WsRole = "admin" | "member" | "viewer";
// Kept for the pages that only ask "can this person manage things here":
// "owner" means workspace admin (org owners are admins everywhere).
export type Role = "owner" | "member";

export type UserWorkspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  organizationKind: string;
  orgRole: OrgRole;
  wsRole: WsRole;
  role: Role;
  setupCompletedAt: Date | null;
};

// Every workspace the user can open, their own org first. Org owners see
// every workspace in their org as admin; everyone else sees the workspaces
// they were added to, with that workspace's role.
export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  const rows = await db
    .select({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.displayName,
      organizationKind: organization.kind,
      orgRole: membership.role,
      memberRole: workspaceMember.role,
      setupCompletedAt: workspace.setupCompletedAt,
    })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .innerJoin(workspace, eq(workspace.organizationId, organization.id))
    .leftJoin(workspaceMember, and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)))
    .where(and(eq(membership.userId, userId), or(eq(membership.role, "owner"), sql`${workspaceMember.id} is not null`)))
    .orderBy(asc(membership.createdAt), asc(workspace.createdAt));

  return rows.map((r) => {
    const orgRole = r.orgRole as OrgRole;
    const wsRole: WsRole = orgRole === "owner" ? "admin" : ((r.memberRole as WsRole) ?? "viewer");
    return {
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      workspaceSlug: r.workspaceSlug,
      organizationId: r.organizationId,
      organizationSlug: r.organizationSlug,
      organizationName: r.organizationName,
      organizationKind: r.organizationKind,
      orgRole,
      wsRole,
      role: wsRole === "admin" ? "owner" : "member",
      setupCompletedAt: r.setupCompletedAt,
    };
  });
}

// The workspace this request acts on: the one named by the workspace
// cookie, else the first one in the org cookie's org, else the first.
export async function getUserWorkspace(userId: string): Promise<UserWorkspace | null> {
  const all = await listUserWorkspaces(userId);
  if (all.length === 0) return null;
  let wantedWs: string | undefined;
  let wantedOrg: string | undefined;
  try {
    const jar = await cookies();
    wantedWs = jar.get(CURRENT_WS_COOKIE)?.value;
    wantedOrg = jar.get(CURRENT_ORG_COOKIE)?.value;
  } catch {
    wantedWs = undefined;
  }
  return (
    all.find((w) => w.workspaceId === wantedWs) ?? all.find((w) => w.organizationId === wantedOrg) ?? all[0]
  );
}

// The role a user has in one workspace, or null if they can't open it.
export async function workspaceRoleFor(userId: string, workspaceId: string): Promise<WsRole | null> {
  const all = await listUserWorkspaces(userId);
  return all.find((w) => w.workspaceId === workspaceId)?.wsRole ?? null;
}

export type OrgSummary = { id: string; slug: string; name: string; kind: string; orgRole: OrgRole };

// Distinct orgs, in the same order as the workspace list.
export function orgsOf(all: UserWorkspace[]): OrgSummary[] {
  const seen = new Map<string, OrgSummary>();
  for (const w of all) {
    if (!seen.has(w.organizationId)) {
      seen.set(w.organizationId, {
        id: w.organizationId,
        slug: w.organizationSlug,
        name: w.organizationName,
        kind: w.organizationKind,
        orgRole: w.orgRole,
      });
    }
  }
  return [...seen.values()];
}

export async function hasConnectedAgent(workspaceId: string) {
  const [row] = await db
    .select({ id: oauthGrant.id })
    .from(oauthGrant)
    .where(and(eq(oauthGrant.workspaceId, workspaceId), isNull(oauthGrant.revokedAt)))
    .limit(1);
  return !!row;
}

export async function hasOwnAgent(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: oauthGrant.id })
    .from(oauthGrant)
    .where(and(eq(oauthGrant.workspaceId, workspaceId), eq(oauthGrant.userId, userId), isNull(oauthGrant.revokedAt)))
    .limit(1);
  return !!row;
}

export async function hasInstance(workspaceId: string) {
  const [row] = await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, workspaceId)).limit(1);
  return !!row;
}

// A personal organization is named after its owner's namespace, and its
// first workspace is called "Default", so the organization name says more.
export function workspaceLabel(w: { organizationName: string; workspaceName: string }) {
  return w.workspaceName && w.workspaceName !== "Default" ? w.workspaceName : w.organizationName;
}
