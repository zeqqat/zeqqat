import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { apiEndpoint, callLog, connection, connectionGrant, instance, integration, oauthClient, organization, policy, user } from "../db/schema";
import { connectionUrl, sunsetState, type SunsetState } from "./connections";
import { agentBrand, connectedPeople, cutoffLabel, urlCounts, usageByUrl, type AgentBrand, type Usage } from "./mcp-urls";
import { appCallsOnly } from "./overview";
import { toPolicyCanonical } from "./tool-names";

// Data for one Dokploy instance's page (app/app/dokploy-instances/[id]):
// the MCP URLs that reach it (with the policy each one applies here), its
// calls (who, which tool, which agent, through which URL) and the people
// connected through those URLs. Access belongs to an MCP URL, never to the
// instance alone (UI principle 45), so everything is listed per URL.

const policyOrg = alias(organization, "policy_org");
const personalOrg = alias(organization, "personal_org");

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export type InstanceUrl = {
  id: string;
  url: string;
  prefix: string;
  name: string;
  shortId: string;
  isPublic: boolean;
  state: SunsetState;
  cutoff: string | null;
  people: number;
  instances: number;
  // Calls through this URL to this instance only.
  usage: Usage;
  // Canonical name and version of the policy this URL applies here, or
  // null for the default policy (whole kinds).
  policy: string | null;
};

export async function instanceUrls(workspaceId: string, instanceId: string): Promise<InstanceUrl[]> {
  const rows = await db
    .select({
      c: connection,
      orgSlug: organization.slug,
      policyName: policy.name,
      policyVersion: policy.version,
      policyNs: policyOrg.slug,
      integrationSlug: integration.slug,
    })
    .from(connectionGrant)
    .innerJoin(connection, eq(connection.id, connectionGrant.connectionId))
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .innerJoin(instance, eq(instance.id, connectionGrant.instanceId))
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .leftJoin(policy, eq(policy.id, connectionGrant.policyId))
    .leftJoin(policyOrg, eq(policyOrg.id, policy.organizationId))
    .where(and(eq(connectionGrant.instanceId, instanceId), eq(connection.workspaceId, workspaceId), isNull(connection.deletedAt)));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.c.id);
  const [usage, counts] = await Promise.all([usageByUrl(workspaceId, ids, instanceId), urlCounts(ids)]);
  return rows
    .map((r) => {
      const url = connectionUrl(r.orgSlug, r.c.name, r.c.shortId);
      const u = usage.get(r.c.id) ?? { days: Array(30).fill(0), hours: Array(24).fill(0) };
      return {
        id: r.c.id,
        url,
        prefix: url.slice(0, url.length - `${r.c.name}/${r.c.shortId}`.length),
        name: r.c.name,
        shortId: r.c.shortId,
        isPublic: r.c.authMode === "public",
        state: sunsetState(r.c),
        cutoff: r.c.sunsetAt ? cutoffLabel(r.c.sunsetAt) : null,
        people: counts.people.get(r.c.id) ?? 0,
        instances: counts.instances.get(r.c.id) ?? 0,
        usage: u,
        policy: r.policyName && r.policyNs ? `${toPolicyCanonical(r.policyNs, r.integrationSlug, r.policyName)} v${r.policyVersion}` : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.state === "cutoff") - Number(b.state === "cutoff") ||
        b.usage.days.slice(23).reduce((x, y) => x + y, 0) - a.usage.days.slice(23).reduce((x, y) => x + y, 0),
    );
}

// One call on this instance, as its card shows it.
export type InstanceCall = {
  id: string;
  at: string; // ISO
  outcome: "ok" | "blocked" | "error" | "running";
  // The response had secrets in it, which Zeqqat swapped for handles.
  hidden: boolean;
  op: string;
  kind: string | null;
  durationMs: number | null;
  person: { id: string; name: string; username: string | null; image: string | null } | null;
  agent: { brand: AgentBrand; label: string };
  url: string | null; // "deployment/a39f"
  why: string | null; // why it was blocked or failed
};

const HIDDEN_SQL = sql<boolean>`(position('[redacted by zeqqat]' in coalesce(${callLog.responseBody}::text, '')) > 0
  or position('{{zq_secret_' in coalesce(${callLog.responseBody}::text, '')) > 0)`;

// Calls to this instance over the last 30 UTC days (the longest period the
// top card offers), newest first.
export async function instanceCalls(workspaceId: string, instanceId: string, limit = 500): Promise<InstanceCall[]> {
  const from = new Date(dayStart().getTime() - 29 * 86_400_000);
  const rows = await db
    .select({
      id: callLog.id,
      at: callLog.createdAt,
      outcome: callLog.outcome,
      hidden: HIDDEN_SQL,
      toolName: callLog.toolName,
      op: apiEndpoint.name,
      kind: apiEndpoint.kind,
      durationMs: callLog.durationMs,
      errorMessage: callLog.errorMessage,
      userId: callLog.userId,
      userName: user.name,
      userImage: user.image,
      username: personalOrg.slug,
      clientId: oauthClient.clientId,
      clientName: oauthClient.clientName,
      connName: connection.name,
      connShortId: connection.shortId,
    })
    .from(callLog)
    .leftJoin(apiEndpoint, eq(apiEndpoint.id, callLog.apiEndpointId))
    .leftJoin(user, eq(user.id, callLog.userId))
    .leftJoin(personalOrg, and(eq(personalOrg.ownerUserId, callLog.userId), eq(personalOrg.kind, "personal")))
    .leftJoin(oauthClient, eq(oauthClient.id, callLog.oauthClientId))
    .leftJoin(connection, eq(connection.id, callLog.connectionId))
    .where(and(eq(callLog.workspaceId, workspaceId), eq(callLog.instanceId, instanceId), appCallsOnly, gte(callLog.createdAt, from)))
    .orderBy(desc(callLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    outcome: (["ok", "blocked", "error", "running"].includes(r.outcome) ? r.outcome : "error") as InstanceCall["outcome"],
    hidden: Boolean(r.hidden),
    op: r.op ?? r.toolName,
    kind: r.kind,
    durationMs: r.outcome === "blocked" ? null : r.durationMs,
    person: r.userId ? { id: r.userId, name: r.userName ?? "Someone", username: r.username, image: r.userImage } : null,
    agent: r.clientId ? agentBrand(r.clientId, r.clientName ?? "") : { brand: "other", label: r.clientName ?? "Unknown agent" },
    url: r.connName && r.connShortId ? `${r.connName}/${r.connShortId}` : null,
    why: r.outcome === "ok" ? null : r.errorMessage,
  }));
}

// Everyone connected through any MCP URL that reaches this instance, one
// row per person: the URLs they connected through, their agents, and their
// calls on this instance.
export type InstancePerson = {
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  since: string; // ISO
  urls: string[]; // "deployment/a39f"
  agents: { brand: AgentBrand; label: string }[];
  calls: number;
};

export async function instancePeople(workspaceId: string, instanceId: string, urls: InstanceUrl[]): Promise<InstancePerson[]> {
  const live = urls.filter((u) => !u.isPublic);
  if (live.length === 0) return [];
  const [lists, calls] = await Promise.all([
    Promise.all(live.map(async (u) => ({ u, people: await connectedPeople(u.id) }))),
    db
      .select({ userId: callLog.userId, n: sql<number>`count(*)::int` })
      .from(callLog)
      .where(and(eq(callLog.workspaceId, workspaceId), eq(callLog.instanceId, instanceId), appCallsOnly))
      .groupBy(callLog.userId),
  ]);
  const out = new Map<string, InstancePerson>();
  for (const { u, people } of lists) {
    for (const p of people) {
      const row = out.get(p.userId) ?? {
        userId: p.userId,
        name: p.name,
        username: p.username,
        image: p.image,
        since: p.since.toISOString(),
        urls: [],
        agents: [],
        calls: calls.find((c) => c.userId === p.userId)?.n ?? 0,
      };
      if (p.since.toISOString() < row.since) row.since = p.since.toISOString();
      row.urls.push(`${u.name}/${u.shortId}`);
      for (const a of p.agents) if (!row.agents.some((x) => x.brand === a.brand && x.label === a.label)) row.agents.push(a);
      out.set(p.userId, row);
    }
  }
  return [...out.values()].sort((a, b) => b.calls - a.calls || a.since.localeCompare(b.since));
}

// Who added the instance: name, username and photo.
export async function addedBy(userId: string | null) {
  if (!userId) return null;
  const [r] = await db
    .select({ id: user.id, name: user.name, image: user.image, username: personalOrg.slug })
    .from(user)
    .leftJoin(personalOrg, and(eq(personalOrg.ownerUserId, user.id), eq(personalOrg.kind, "personal")))
    .where(eq(user.id, userId))
    .limit(1);
  return r ?? null;
}

