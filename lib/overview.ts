import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, callLog, instance, membership, oauthClient, oauthGrant, user, workspaceMember } from "../db/schema";

export const REDACTED_MARK = "[redacted by zeqqat]";

// "Today" on the overview is the UTC day, the same window the Activity
// filters use, so a tile's number and the page it opens always agree.
export function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Counts how many values the scrubber replaced: every occurrence of the
// marker in the stored (already scrubbed) responses.
const redactedCount = sql<number>`coalesce(sum(
  (length(${callLog.responseBody}::text) - length(replace(${callLog.responseBody}::text, ${REDACTED_MARK}, '')))
  / length(${REDACTED_MARK})
), 0)`;

export async function getOverviewStats(workspaceId: string) {
  const today = startOfToday();
  const inWs = eq(callLog.workspaceId, workspaceId);

  const [agentsRows, instancesRows, callsRows, hourRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${oauthGrant.oauthClientId})` })
      .from(oauthGrant)
      .where(and(eq(oauthGrant.workspaceId, workspaceId), sql`${oauthGrant.revokedAt} is null`)),
    db.select({ n: sql<number>`count(*)` }).from(instance).where(eq(instance.workspaceId, workspaceId)),
    db
      .select({
        calls: sql<number>`count(*)`,
        blocked: sql<number>`count(*) filter (where ${callLog.outcome} = 'blocked')`,
        redacted: redactedCount,
      })
      .from(callLog)
      .where(and(inWs, gte(callLog.createdAt, today))),
    db
      .select({
        h: sql<number>`extract(hour from ${callLog.createdAt} at time zone 'UTC')::int`,
        n: sql<number>`count(*)`,
      })
      .from(callLog)
      .where(and(inWs, gte(callLog.createdAt, today)))
      .groupBy(sql`1`),
  ]);

  // One bucket per UTC hour so far today, oldest first.
  const hourly = new Array<number>(new Date().getUTCHours() + 1).fill(0);
  for (const r of hourRows) {
    const h = Number(r.h);
    if (h >= 0 && h < hourly.length) hourly[h] = Number(r.n);
  }

  return {
    agents: Number(agentsRows[0]?.n ?? 0),
    instances: Number(instancesRows[0]?.n ?? 0),
    callsToday: Number(callsRows[0]?.calls ?? 0),
    blockedToday: Number(callsRows[0]?.blocked ?? 0),
    redactedToday: Number(callsRows[0]?.redacted ?? 0),
    hourly,
  };
}

// Who is in a workspace, as the Members page counts it: org owners (admins
// of every workspace) plus anyone added to this workspace with a role.
export async function listWorkspacePeople(organizationId: string, workspaceId: string) {
  const [owners, added] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, image: user.image, at: membership.createdAt })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.organizationId, organizationId), eq(membership.role, "owner"))),
    db
      .select({ id: user.id, name: user.name, image: user.image, at: workspaceMember.createdAt })
      .from(workspaceMember)
      .innerJoin(user, eq(user.id, workspaceMember.userId))
      .where(eq(workspaceMember.workspaceId, workspaceId)),
  ]);
  const seen = new Map<string, { name: string; image: string | null }>();
  for (const p of [...owners, ...added].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!seen.has(p.id)) seen.set(p.id, { name: p.name, image: p.image ?? null });
  }
  return [...seen.values()];
}

export const CALL_SELECT = {
  id: callLog.id,
  toolName: callLog.toolName,
  outcome: callLog.outcome,
  httpStatus: callLog.httpStatus,
  durationMs: callLog.durationMs,
  requestArgs: callLog.requestArgs,
  responseBody: callLog.responseBody,
  errorMessage: callLog.errorMessage,
  createdAt: callLog.createdAt,
  instanceAlias: instance.alias,
  clientName: oauthClient.clientName,
  clientId: oauthClient.clientId,
  kind: apiEndpoint.kind,
};

export async function getRecentCalls(workspaceId: string, limit = 5) {
  return db
    .select(CALL_SELECT)
    .from(callLog)
    .leftJoin(instance, eq(instance.id, callLog.instanceId))
    .leftJoin(oauthClient, eq(oauthClient.id, callLog.oauthClientId))
    .leftJoin(apiEndpoint, eq(apiEndpoint.id, callLog.apiEndpointId))
    .where(eq(callLog.workspaceId, workspaceId))
    .orderBy(desc(callLog.createdAt))
    .limit(limit);
}
