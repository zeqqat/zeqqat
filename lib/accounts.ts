import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { callLog, connection, instance, membership, organization, user, workspace, workspaceMember } from "../db/schema";
import { appCallsOnly } from "./overview";
import { orgsOf, type UserWorkspace } from "./workspace";

// The account level of the dashboard (/<username>): one account's
// workspaces, members and settings. An account is a personal account
// (@gaita, one owner forever) or an organization. Both live in the
// `organization` table, told apart by `kind`.

export type ShellAccount = { id: string; slug: string; name: string; kind: "personal" | "organization"; mine: boolean };

// The accounts in the path's dropdown: your own first, then the
// organizations you're in, in the order you joined them.
export function accountsFor(all: UserWorkspace[], userId: string, personalOwnerId: Map<string, string | null>): ShellAccount[] {
  const list = orgsOf(all).map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    kind: (o.kind === "personal" ? "personal" : "organization") as ShellAccount["kind"],
    mine: o.kind === "personal" && personalOwnerId.get(o.id) === userId,
  }));
  return [...list.filter((a) => a.mine), ...list.filter((a) => !a.mine)];
}

export async function ownersOf(orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, string | null>();
  const rows = await db.select({ id: organization.id, owner: organization.ownerUserId }).from(organization).where(inArray(organization.id, orgIds));
  return new Map(rows.map((r) => [r.id, r.owner]));
}

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export type WorkspaceCard = {
  id: string;
  name: string;
  instances: number;
  urls: number;
  people: number;
  week: number[]; // calls to apps per UTC day, oldest first, today last
};

// One card per workspace of this account that the person can open.
export async function workspaceCards(orgId: string, mine: UserWorkspace[]): Promise<WorkspaceCard[]> {
  const ids = mine.filter((w) => w.organizationId === orgId).map((w) => w.workspaceId);
  if (ids.length === 0) return [];
  const from = new Date(dayStart().getTime() - 6 * 86_400_000);
  const [inst, urls, members, owners, calls] = await Promise.all([
    db.select({ ws: instance.workspaceId, n: sql<number>`count(*)::int` }).from(instance).where(inArray(instance.workspaceId, ids)).groupBy(instance.workspaceId),
    db
      .select({ ws: connection.workspaceId, n: sql<number>`count(*)::int` })
      .from(connection)
      .where(and(inArray(connection.workspaceId, ids), isNull(connection.deletedAt)))
      .groupBy(connection.workspaceId),
    db
      .select({ ws: workspaceMember.workspaceId, userId: workspaceMember.userId })
      .from(workspaceMember)
      .where(inArray(workspaceMember.workspaceId, ids)),
    db.select({ userId: membership.userId }).from(membership).where(and(eq(membership.organizationId, orgId), eq(membership.role, "owner"))),
    db
      .select({
        ws: callLog.workspaceId,
        day: sql<string>`to_char(date_trunc('day', ${callLog.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(callLog)
      .where(and(inArray(callLog.workspaceId, ids), appCallsOnly, gte(callLog.createdAt, from)))
      .groupBy(callLog.workspaceId, sql`2`),
  ]);
  const today = dayStart().getTime();
  const ownerIds = new Set(owners.map((o) => o.userId));
  return mine
    .filter((w) => w.organizationId === orgId)
    .map((w) => {
      const week = Array(7).fill(0) as number[];
      for (const c of calls) {
        if (c.ws !== w.workspaceId) continue;
        const i = 6 - Math.round((today - new Date(`${c.day}T00:00:00Z`).getTime()) / 86_400_000);
        if (i >= 0 && i < 7) week[i] = c.n;
      }
      // Org owners are admins of every workspace; everyone else is listed.
      const people = new Set([...ownerIds, ...members.filter((m) => m.ws === w.workspaceId).map((m) => m.userId)]);
      return {
        id: w.workspaceId,
        name: w.workspaceName,
        instances: inst.find((r) => r.ws === w.workspaceId)?.n ?? 0,
        urls: urls.find((r) => r.ws === w.workspaceId)?.n ?? 0,
        people: people.size,
        week,
      };
    });
}

export type AccountMember = {
  userId: string;
  name: string;
  image: string | null;
  username: string | null;
  owner: boolean;
  workspaces: string[];
};

// Everyone in this account: its owners, then members in the order they
// joined, each with the workspaces they work in. Usernames, never emails.
export async function accountMembers(orgId: string): Promise<AccountMember[]> {
  const [people, wsRows, allWs] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, image: user.image, role: membership.role })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.organizationId, orgId))
      .orderBy(membership.createdAt),
    db
      .select({ userId: workspaceMember.userId, name: workspace.name })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(eq(workspace.organizationId, orgId))
      .orderBy(workspace.createdAt),
    db.select({ name: workspace.name }).from(workspace).where(eq(workspace.organizationId, orgId)).orderBy(workspace.createdAt),
  ]);
  const ids = people.map((p) => p.userId);
  const handles = ids.length
    ? await db
        .select({ owner: organization.ownerUserId, slug: organization.slug })
        .from(organization)
        .where(and(eq(organization.kind, "personal"), inArray(organization.ownerUserId, ids)))
    : [];
  const list = people.map((p) => ({
    userId: p.userId,
    name: p.name,
    image: p.image,
    username: handles.find((h) => h.owner === p.userId)?.slug ?? null,
    owner: p.role === "owner",
    workspaces: p.role === "owner" ? allWs.map((w) => w.name) : wsRows.filter((r) => r.userId === p.userId).map((r) => r.name),
  }));
  return [...list.filter((m) => m.owner), ...list.filter((m) => !m.owner)];
}
