import { and, asc, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { callLog, connection, invitation, membership, organization, user, workspace, workspaceMember } from "../db/schema";
import { connectedPeople, type AgentBrand } from "./mcp-urls";
import { appCallsOnly } from "./overview";
import type { WsRole } from "./workspace";

// Data for the Members pages: the account's (/<username>/members, everyone
// in the account and the workspaces they're in) and a workspace's
// (/<username>/<workspace>/members, the account's people given access to
// that workspace, with their role and their calls this week). A workspace
// member is always a member of the account first.

export type Person = { userId: string; name: string; image: string | null; username: string | null };
export type MemberWs = { id: string; slug: string; name: string; role: WsRole | "owner" };
export type AccountPerson = Person & { owner: boolean; creator: boolean; since: Date; workspaces: MemberWs[] };
export type Agent = { brand: AgentBrand; label: string };
export type WsPerson = Person & { role: WsRole | "owner"; memberId: string | null; week: number[]; agents: Agent[] };
export type PendingInvite = { id: string; email: string; role: WsRole; owner: boolean; wsId: string | null; wsName: string | null; expiresAt: Date };

// Personal usernames for a set of people.
async function usernames(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ owner: organization.ownerUserId, slug: organization.slug })
    .from(organization)
    .where(and(eq(organization.kind, "personal"), inArray(organization.ownerUserId, ids)));
  return new Map(rows.map((r) => [r.owner!, r.slug]));
}

export async function personOf(userId: string | null): Promise<Person | null> {
  if (!userId) return null;
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!u) return null;
  return { userId: u.id, name: u.name, image: u.image, username: (await usernames([u.id])).get(u.id) ?? null };
}

// Everyone in the account: you first, then the other owners, then the rest.
export async function accountPeople(orgId: string, meId: string): Promise<AccountPerson[]> {
  const [org, people, wsRows, allWs] = await Promise.all([
    db.query.organization.findFirst({ where: eq(organization.id, orgId) }),
    db
      .select({ userId: user.id, name: user.name, image: user.image, role: membership.role, since: membership.createdAt })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.organizationId, orgId))
      .orderBy(asc(membership.createdAt)),
    db
      .select({ userId: workspaceMember.userId, id: workspace.id, slug: workspace.slug, name: workspace.name, role: workspaceMember.role })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(eq(workspace.organizationId, orgId))
      .orderBy(asc(workspace.createdAt)),
    db
      .select({ id: workspace.id, slug: workspace.slug, name: workspace.name })
      .from(workspace)
      .where(eq(workspace.organizationId, orgId))
      .orderBy(asc(workspace.createdAt)),
  ]);
  const names = await usernames(people.map((p) => p.userId));
  const list: AccountPerson[] = people.map((p) => {
    const owner = p.role === "owner";
    return {
      userId: p.userId,
      name: p.name,
      image: p.image,
      username: names.get(p.userId) ?? null,
      owner,
      creator: org?.ownerUserId === p.userId,
      since: p.since,
      workspaces: owner
        ? allWs.map((w) => ({ ...w, role: "owner" as const }))
        : wsRows.filter((r) => r.userId === p.userId).map((r) => ({ id: r.id, slug: r.slug, name: r.name, role: r.role as WsRole })),
    };
  });
  return [
    ...list.filter((m) => m.userId === meId),
    ...list.filter((m) => m.userId !== meId && m.owner),
    ...list.filter((m) => m.userId !== meId && !m.owner),
  ];
}

// One person in the account, found by username (or user id when they have none).
export async function findAccountPerson(orgId: string, meId: string, key: string) {
  const all = await accountPeople(orgId, meId);
  return { all, person: all.find((p) => p.username === key || p.userId === key) ?? null };
}

// Who brought them in: the invite they accepted (newest first), if any.
export async function invitedBy(orgId: string, userId: string, workspaceId?: string) {
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!u) return null;
  const conds = [
    eq(invitation.organizationId, orgId),
    eq(invitation.email, u.email.toLowerCase()),
    sql`${invitation.acceptedAt} is not null`,
  ];
  if (workspaceId) conds.push(eq(invitation.workspaceId, workspaceId));
  const [row] = await db
    .select({ by: invitation.invitedByUserId, at: invitation.acceptedAt })
    .from(invitation)
    .where(and(...conds))
    .orderBy(desc(invitation.acceptedAt))
    .limit(1);
  if (!row) return null;
  const person = await personOf(row.by);
  return person ? { person, at: row.at! } : null;
}

function weekStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 6);
  return d;
}

// Calls per person per day over the last 7 days (today last), in one workspace.
async function weekByPerson(workspaceId: string, ids: string[]) {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const start = weekStart();
  const rows = await db
    .select({
      userId: callLog.userId,
      day: sql<number>`floor(extract(epoch from (${callLog.createdAt} - ${start.toISOString()}::timestamptz)) / 86400)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(callLog)
    .where(and(eq(callLog.workspaceId, workspaceId), inArray(callLog.userId, ids), gte(callLog.createdAt, start), appCallsOnly))
    .groupBy(callLog.userId, sql`2`);
  for (const id of ids) out.set(id, [0, 0, 0, 0, 0, 0, 0]);
  for (const r of rows) {
    if (!r.userId || r.day < 0 || r.day > 6) continue;
    out.get(r.userId)![r.day] += r.n;
  }
  return out;
}

// The MCP URLs in a workspace people are connected through, per person.
export type PersonUrl = { id: string; name: string; shortId: string; since: Date; agents: Agent[]; calls: number };
async function urlsByPerson(workspaceId: string) {
  const conns = await db
    .select({ id: connection.id, name: connection.name, shortId: connection.shortId })
    .from(connection)
    .where(and(eq(connection.workspaceId, workspaceId), isNull(connection.deletedAt)))
    .orderBy(asc(connection.createdAt));
  const lists = await Promise.all(conns.map(async (c) => ({ c, people: await connectedPeople(c.id) })));
  const out = new Map<string, PersonUrl[]>();
  for (const { c, people } of lists) {
    for (const p of people) {
      const list = out.get(p.userId) ?? [];
      list.push({ id: c.id, name: c.name, shortId: c.shortId, since: p.since, agents: p.agents, calls: 0 });
      out.set(p.userId, list);
    }
  }
  return out;
}

// Calls this week per MCP URL for one person in one workspace.
async function weekCallsByUrl(workspaceId: string, userId: string) {
  const rows = await db
    .select({ id: callLog.connectionId, n: sql<number>`count(*)::int` })
    .from(callLog)
    .where(and(eq(callLog.workspaceId, workspaceId), eq(callLog.userId, userId), gte(callLog.createdAt, weekStart()), appCallsOnly))
    .groupBy(callLog.connectionId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

// Everyone in this workspace: the account's owners (admins everywhere) and
// whoever was added here. You first, then owners, then the rest.
export async function workspacePeople(orgId: string, workspaceId: string, meId: string): Promise<{ here: WsPerson[]; notHere: Person[] }> {
  const [people, rows] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, image: user.image, role: membership.role })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.organizationId, orgId))
      .orderBy(asc(membership.createdAt)),
    db
      .select({ id: workspaceMember.id, userId: workspaceMember.userId, role: workspaceMember.role })
      .from(workspaceMember)
      .where(eq(workspaceMember.workspaceId, workspaceId)),
  ]);
  const names = await usernames(people.map((p) => p.userId));
  const inWs = people.filter((p) => p.role === "owner" || rows.some((r) => r.userId === p.userId));
  const [week, urls] = await Promise.all([weekByPerson(workspaceId, inWs.map((p) => p.userId)), urlsByPerson(workspaceId)]);
  const here: WsPerson[] = inWs.map((p) => {
    const row = rows.find((r) => r.userId === p.userId);
    const agents: Agent[] = [];
    for (const u of urls.get(p.userId) ?? []) for (const a of u.agents) if (!agents.some((x) => x.brand === a.brand && x.label === a.label)) agents.push(a);
    return {
      userId: p.userId,
      name: p.name,
      image: p.image,
      username: names.get(p.userId) ?? null,
      role: p.role === "owner" ? "owner" : (row!.role as WsRole),
      memberId: p.role === "owner" ? null : row!.id,
      week: week.get(p.userId) ?? [0, 0, 0, 0, 0, 0, 0],
      agents,
    };
  });
  const notHere = people
    .filter((p) => !inWs.includes(p))
    .map((p) => ({ userId: p.userId, name: p.name, image: p.image, username: names.get(p.userId) ?? null }));
  return {
    here: [
      ...here.filter((m) => m.userId === meId),
      ...here.filter((m) => m.userId !== meId && m.role === "owner"),
      ...here.filter((m) => m.userId !== meId && m.role !== "owner"),
    ],
    notHere,
  };
}

// The MCP URLs one person is connected through in this workspace, with
// their calls this week through each.
export async function personUrls(workspaceId: string, userId: string): Promise<PersonUrl[]> {
  const [urls, calls] = await Promise.all([urlsByPerson(workspaceId), weekCallsByUrl(workspaceId, userId)]);
  return (urls.get(userId) ?? []).map((u) => ({ ...u, calls: calls.get(u.id) ?? 0 })).sort((a, b) => b.calls - a.calls);
}

// Open invites in the account (all, or one workspace's).
export async function pendingInvites(orgId: string, workspaceId?: string): Promise<PendingInvite[]> {
  const conds = [
    eq(invitation.organizationId, orgId),
    isNull(invitation.acceptedAt),
    isNull(invitation.revokedAt),
    gt(invitation.expiresAt, new Date()),
  ];
  if (workspaceId) conds.push(eq(invitation.workspaceId, workspaceId));
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.workspaceRole,
      orgRole: invitation.role,
      wsId: invitation.workspaceId,
      wsName: workspace.name,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .leftJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .where(and(...conds))
    .orderBy(desc(invitation.createdAt));
  return rows.map((r) => ({ id: r.id, email: r.email, role: r.role as WsRole, owner: r.orgRole === "owner", wsId: r.wsId, wsName: r.wsName, expiresAt: r.expiresAt }));
}

