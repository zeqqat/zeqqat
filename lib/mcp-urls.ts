import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { staleAgents } from "./tools-changed";
import { db } from "../db";
import { apiEndpoint, callLog, connectionGrant, instance, oauthClient, oauthGrant, organization, policy, user } from "../db/schema";
import { appCallsOnly } from "./overview";
import { agentHost } from "./permissions";

// Usage and people for the MCP URLs pages (app/[org]/[ws]/mcp-urls). In the code
// an MCP URL is still a `connection`; the dashboard and agents say MCP URL.

export type Period = "today" | "week" | "month";
export const PERIODS: Period[] = ["today", "week", "month"];
export const PERIOD_LABEL: Record<Period, string> = { today: "today", week: "this week", month: "this month" };

// Calls to apps per MCP URL: 30 UTC days (oldest first, today last) and
// today's 24 UTC hours. Zeqqat's own tools (search, describe...) don't
// count, the same rule as the overview tiles.
export type Usage = { days: number[]; hours: number[] };

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// With instanceId, only calls through each URL to that one instance.
export async function usageByUrl(workspaceId: string, connectionIds: string[], instanceId?: string): Promise<Map<string, Usage>> {
  const out = new Map<string, Usage>(connectionIds.map((id) => [id, { days: Array(30).fill(0), hours: Array(24).fill(0) }]));
  if (connectionIds.length === 0) return out;
  const today = dayStart();
  const from = new Date(today.getTime() - 29 * 86_400_000);
  const scope = and(
    eq(callLog.workspaceId, workspaceId),
    inArray(callLog.connectionId, connectionIds),
    instanceId ? eq(callLog.instanceId, instanceId) : undefined,
    appCallsOnly,
  );
  const [dayRows, hourRows] = await Promise.all([
    db
      .select({
        id: callLog.connectionId,
        day: sql<string>`to_char(date_trunc('day', ${callLog.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(callLog)
      .where(and(scope, gte(callLog.createdAt, from)))
      .groupBy(callLog.connectionId, sql`2`),
    db
      .select({
        id: callLog.connectionId,
        hour: sql<number>`extract(hour from ${callLog.createdAt} at time zone 'UTC')::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(callLog)
      .where(and(scope, gte(callLog.createdAt, today)))
      .groupBy(callLog.connectionId, sql`2`),
  ]);
  for (const r of dayRows) {
    const u = r.id ? out.get(r.id) : undefined;
    if (!u) continue;
    const i = 29 - Math.round((today.getTime() - new Date(`${r.day}T00:00:00Z`).getTime()) / 86_400_000);
    if (i >= 0 && i < 30) u.days[i] = r.n;
  }
  for (const r of hourRows) {
    const u = r.id ? out.get(r.id) : undefined;
    if (u && r.hour >= 0 && r.hour < 24) u.hours[r.hour] = r.n;
  }
  return out;
}

// "Dec 1, 2026": the day a URL turns (or turned) off, in UTC like the cutoff.
export function cutoffLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function series(u: Usage, p: Period): number[] {
  return p === "today" ? u.hours : p === "week" ? u.days.slice(23) : u.days;
}

export function total(u: Usage, p: Period): number {
  return series(u, p).reduce((a, b) => a + b, 0);
}

// How many people have a live sign-in on each MCP URL, and how many
// instances each one reaches.
export async function urlCounts(connectionIds: string[]) {
  if (connectionIds.length === 0) return { people: new Map<string, number>(), instances: new Map<string, number>() };
  const [people, instances] = await Promise.all([
    db
      .select({ id: oauthGrant.connectionId, n: sql<number>`count(distinct ${oauthGrant.userId})::int` })
      .from(oauthGrant)
      .where(and(inArray(oauthGrant.connectionId, connectionIds), isNull(oauthGrant.revokedAt)))
      .groupBy(oauthGrant.connectionId),
    db
      .select({ id: connectionGrant.connectionId, n: sql<number>`count(*)::int` })
      .from(connectionGrant)
      .where(inArray(connectionGrant.connectionId, connectionIds))
      .groupBy(connectionGrant.connectionId),
  ]);
  return {
    people: new Map(people.filter((r) => r.id).map((r) => [r.id!, r.n])),
    instances: new Map(instances.map((r) => [r.id, r.n])),
  };
}

// The agents people use, as the dashboard draws them. A client is matched
// by its name or the host of its client id; anything else is "other".
export type AgentBrand = "claude" | "cursor" | "chatgpt" | "other";
export function agentBrand(clientId: string, clientName: string): { brand: AgentBrand; label: string } {
  const s = `${clientName} ${agentHost(clientId, clientName)}`.toLowerCase();
  if (s.includes("claude") || s.includes("anthropic")) return { brand: "claude", label: "Claude" };
  if (s.includes("cursor")) return { brand: "cursor", label: "Cursor" };
  if (s.includes("chatgpt") || s.includes("openai")) return { brand: "chatgpt", label: "ChatGPT" };
  return { brand: "other", label: clientName || agentHost(clientId, "Agent") };
}

// Everyone connected to one MCP URL, one row per person: when they first
// connected, the agents they used, and how many calls to apps they made
// through this URL.
export type ConnectedPerson = {
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  since: Date;
  // stale: this agent is working from an old Zeqqat tool list and needs
  // reconnecting (lib/tools-changed.ts).
  agents: { brand: AgentBrand; label: string; stale?: boolean }[];
  calls: number;
};

export async function connectedPeople(connectionId: string): Promise<ConnectedPerson[]> {
  const grants = await db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
      at: oauthGrant.createdAt,
      clientId: oauthClient.clientId,
      clientUuid: oauthClient.id,
      clientName: oauthClient.clientName,
    })
    .from(oauthGrant)
    .innerJoin(user, eq(user.id, oauthGrant.userId))
    .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.oauthClientId))
    .where(and(eq(oauthGrant.connectionId, connectionId), isNull(oauthGrant.revokedAt)));
  if (grants.length === 0) return [];
  const ids = [...new Set(grants.map((g) => g.userId))];
  const [handles, calls] = await Promise.all([
    db
      .select({ userId: organization.ownerUserId, slug: organization.slug })
      .from(organization)
      .where(and(eq(organization.kind, "personal"), inArray(organization.ownerUserId, ids))),
    db
      .select({ userId: callLog.userId, n: sql<number>`count(*)::int` })
      .from(callLog)
      .where(and(eq(callLog.connectionId, connectionId), inArray(callLog.userId, ids), appCallsOnly))
      .groupBy(callLog.userId),
  ]);
  const stale = new Set((await staleAgents({ connectionId })).map((s) => `${s.userId}:${s.clientId}`));
  const people = new Map<string, ConnectedPerson>();
  for (const g of grants) {
    const p = people.get(g.userId) ?? {
      userId: g.userId,
      name: g.name,
      username: handles.find((h) => h.userId === g.userId)?.slug ?? null,
      image: g.image,
      since: g.at,
      agents: [],
      calls: calls.find((c) => c.userId === g.userId)?.n ?? 0,
    };
    if (g.at < p.since) p.since = g.at;
    const a: ConnectedPerson["agents"][number] = { ...agentBrand(g.clientId, g.clientName), stale: stale.has(`${g.userId}:${g.clientUuid}`) };
    const had = p.agents.find((x) => x.brand === a.brand && x.label === a.label);
    if (!had) p.agents.push(a);
    else if (a.stale) had.stale = true;
    people.set(g.userId, p);
  }
  return [...people.values()].sort((a, b) => b.calls - a.calls || a.since.getTime() - b.since.getTime());
}

// Tools per kind for each instance: how many exist in its integration,
// and how many a policy's allow list names.
export type KindCounts = { read: number; create: number; edit: number; delete: number };
const ZERO: KindCounts = { read: 0, create: 0, edit: 0, delete: 0 };

export async function toolTotals(instanceIds: string[]): Promise<Map<string, KindCounts>> {
  if (instanceIds.length === 0) return new Map();
  const rows = await db
    .select({ id: instance.id, kind: apiEndpoint.kind, n: sql<number>`count(*)::int` })
    .from(instance)
    .innerJoin(apiEndpoint, and(eq(apiEndpoint.integrationId, instance.integrationId), isNull(apiEndpoint.removedAt)))
    .where(inArray(instance.id, instanceIds))
    .groupBy(instance.id, apiEndpoint.kind);
  const out = new Map<string, KindCounts>();
  for (const r of rows) {
    const c = out.get(r.id) ?? { ...ZERO };
    if (r.kind in c) c[r.kind as keyof KindCounts] = r.n;
    out.set(r.id, c);
  }
  return out;
}

// For each (policy, instance) pair: the policy's allowed tools per kind,
// counted against that instance's integration (removed endpoints don't
// count, the same as at call time).
export async function policyCounts(pairs: { policyId: string; instanceId: string }[]): Promise<Map<string, KindCounts>> {
  const out = new Map<string, KindCounts>();
  if (pairs.length === 0) return out;
  const pols = await db
    .select({ id: policy.id, allow: policy.allow })
    .from(policy)
    .where(inArray(policy.id, [...new Set(pairs.map((p) => p.policyId))]));
  for (const pair of pairs) {
    const allow = pols.find((p) => p.id === pair.policyId)?.allow ?? [];
    const c = { ...ZERO };
    if (allow.length) {
      const rows = await db
        .select({ kind: apiEndpoint.kind, n: sql<number>`count(*)::int` })
        .from(instance)
        .innerJoin(apiEndpoint, and(eq(apiEndpoint.integrationId, instance.integrationId), isNull(apiEndpoint.removedAt)))
        .where(and(eq(instance.id, pair.instanceId), inArray(apiEndpoint.name, allow)))
        .groupBy(apiEndpoint.kind);
      for (const r of rows) if (r.kind in c) c[r.kind as keyof KindCounts] = r.n;
    }
    out.set(`${pair.policyId}:${pair.instanceId}`, c);
  }
  return out;
}
