import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { callLog, connection, membership, organization, workspaceInstance, workspaceMember } from "../db/schema";
import { appCallsOnly } from "./overview";
import type { UserAccount, UserWorkspace } from "./workspace";

// The account level of the dashboard (/<username>): one account's
// workspaces, members and settings. An account is a personal account
// (@gaita, one owner forever) or an organization. Both live in the
// `organization` table, told apart by `kind`.

export type ShellAccount = { id: string; slug: string; name: string; kind: "personal" | "organization"; mine: boolean };

// The accounts in the path's dropdown: your own first, then the
// organizations you're in, in the order you joined them.
export function accountsFor(all: UserAccount[], userId: string): ShellAccount[] {
  const list = all.map((o) => ({
    id: o.organizationId,
    slug: o.organizationSlug,
    name: o.organizationName,
    kind: (o.organizationKind === "personal" ? "personal" : "organization") as ShellAccount["kind"],
    mine: o.organizationKind === "personal" && o.ownerUserId === userId,
  }));
  return [...list.filter((a) => a.mine), ...list.filter((a) => !a.mine)];
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
    db.select({ ws: workspaceInstance.workspaceId, n: sql<number>`count(*)::int` }).from(workspaceInstance).where(inArray(workspaceInstance.workspaceId, ids)).groupBy(workspaceInstance.workspaceId),
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
