import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { instance, membership, oauthGrant, organization, workspace, workspaceMember, connectionMember } from "../db/schema";

import { inWorkspace } from "./instance-scope";
// The org and workspace the user is currently looking at. They only select
// among workspaces the user can already open; they never grant access.
export const CURRENT_ORG_COOKIE = "zq_org";
export const CURRENT_WS_COOKIE = "zq_ws";
// Set by proxy.ts from the URL (lib/paths.ts placeOf): which account and
// workspace this request is about. Always overwritten there, never trusted
// from the client.
export const PLACE_ORG_HEADER = "x-zq-org";
export const PLACE_WS_HEADER = "x-zq-ws";
export const PATH_HEADER = "x-zq-path";

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
export const listUserWorkspaces = cache(async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
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
});

// What the URL says this request is about (proxy.ts), if anything.
export async function placeFromRequest(): Promise<{ org: string | null; ws: string | null }> {
  try {
    const h = await headers();
    return { org: h.get(PLACE_ORG_HEADER), ws: h.get(PLACE_WS_HEADER) };
  } catch {
    return { org: null, ws: null };
  }
}

// The workspace this request acts on. A URL naming an account or a
// workspace decides it: null when the person can't open it (the page is a
// 404 then). Without one (/account, server actions posted from elsewhere):
// the last one picked in the switcher, else the first one.
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
  const place = await placeFromRequest();
  if (place.org) {
    const inOrg = all.filter((w) => w.organizationSlug === place.org);
    if (place.ws) return inOrg.find((w) => w.workspaceSlug === place.ws) ?? null;
    return (
      inOrg.find((w) => w.workspaceId === wantedWs) ??
      inOrg[0] ??
      null
    );
  }
  return (
    all.find((w) => w.workspaceId === wantedWs) ??
    all.find((w) => w.organizationId === wantedOrg) ??
    all[0]
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
  const [row] = await db.select({ id: instance.id }).from(instance).where(inWorkspace(workspaceId)).limit(1);
  return !!row;
}

// A personal organization is named after its owner's namespace, and its
// first workspace is called "Default", so the organization name says more.
export function workspaceLabel(w: { organizationName: string; workspaceName: string }) {
  return w.workspaceName && w.workspaceName !== "Default" ? w.workspaceName : w.organizationName;
}

// Where a signed-in person starts: their own account page, /<username>,
// which lists every workspace they're in (their own or ones they were
// invited to). lib/paths.ts has the URL scheme.
export async function homePathFor(userId: string): Promise<string> {
  const { joinedElsewhere, pendingInvitesFor, personalAccountOf } = await import("./setup");
  const own = await personalAccountOf(userId);
  // Not set up and not in anyone else's organization: an invite waiting
  // for this email comes first, then Setup.
  if (own && !own.setupCompletedAt) {
    if (!(await joinedElsewhere(userId, own.id))) {
      const [invite] = await pendingInvitesFor(userId);
      if (invite) return `/invites/${invite.id}`;
      return `/${own.slug}/setup`;
    }
    // Joined someone else's organization before setting up their own:
    // start in the workspace they joined.
    const other = (await listUserWorkspaces(userId)).find((w) => w.organizationId !== own.id);
    if (other) return `/${other.organizationSlug}/${other.workspaceSlug}`;
  }
  if (own) return `/${own.slug}`;
  const [first] = await listUserWorkspaces(userId);
  return first ? `/${first.organizationSlug}` : "/signin";
}

// A members-only MCP URL: workspace admins (account owners included) may
// always use it; anyone else only if they're on its people list
// (connection_member, filled by invites).
export async function mayUseConnection(userId: string, connectionId: string, workspaceId: string): Promise<boolean> {
  const role = await workspaceRoleFor(userId, workspaceId);
  if (!role) return false;
  if (role === "admin") return true;
  const [row] = await db
    .select({ id: connectionMember.userId })
    .from(connectionMember)
    .where(and(eq(connectionMember.connectionId, connectionId), eq(connectionMember.userId, userId)))
    .limit(1);
  return !!row;
}
