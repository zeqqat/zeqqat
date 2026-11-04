import { and, asc, desc, eq, gte, inArray, isNull, isNotNull, max, min, notLike, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  agentRequest,
  apiEndpoint,
  callLog,
  connection,
  instance,
  integration,
  oauthClient,
  organization,
  user,
  workspace,
} from "../db/schema";
import { callState, lookupText, policyShortName, type CallState } from "./activity-format";
import { connectionUrl } from "./connections";
import { agentHost } from "./permissions";
import { builtinAction, builtinToolName } from "./tool-names";
import { listUserWorkspaces, type UserWorkspace } from "./workspace";

// The Activity screens (project doc activity-request-card-v1): requests
// on the list, a request's calls on its page, one call on the call page.
// Everything is read per viewer: only calls in workspaces the viewer can
// open in the current organization (org owners: all of them).

const NO_ID = "00000000-0000-0000-0000-000000000000";

export type Viewer = { userId: string; ws: UserWorkspace };

async function visibleWorkspaceIds(v: Viewer): Promise<string[]> {
  const all = await listUserWorkspaces(v.userId);
  const ids = all.filter((w) => w.organizationId === v.ws.organizationId).map((w) => w.workspaceId);
  return ids.length ? ids : [NO_ID];
}

const personalOrg = alias(organization, "personal_org");
const integrationOrg = alias(organization, "integration_org");
const connectionOrg = alias(organization, "connection_org");

const CALL_COLUMNS = {
  id: callLog.id,
  requestId: callLog.requestId,
  createdAt: callLog.createdAt,
  outcome: callLog.outcome,
  httpStatus: callLog.httpStatus,
  durationMs: callLog.durationMs,
  toolName: callLog.toolName,
  reason: callLog.reason,
  requestArgs: callLog.requestArgs,
  responseBody: callLog.responseBody,
  outboundRequest: callLog.outboundRequest,
  errorMessage: callLog.errorMessage,
  callerRole: callLog.callerRole,
  policyName: callLog.policyName,
  policyVersion: callLog.policyVersion,
  specRelease: callLog.specRelease,
  loggedAlias: callLog.instanceAlias,
  userId: callLog.userId,
  userName: user.name,
  userImage: user.image,
  username: personalOrg.slug,
  clientId: oauthClient.clientId,
  clientName: oauthClient.clientName,
  workspaceName: workspace.name,
  instanceId: callLog.instanceId,
  instanceAlias: instance.alias,
  instanceBaseUrl: instance.baseUrl,
  op: apiEndpoint.name,
  summary: apiEndpoint.summary,
  kind: apiEndpoint.kind,
  method: apiEndpoint.method,
  path: apiEndpoint.path,
  integrationSlug: integration.slug,
  integrationName: integration.name,
  integrationOrgSlug: integrationOrg.slug,
  connectionId: callLog.connectionId,
  connectionName: connection.name,
  connectionShortId: connection.shortId,
  connectionOrgSlug: connectionOrg.slug,
  accountSlug: organization.slug,
  accountKind: organization.kind,
};

function callsQuery() {
  return db
    .select(CALL_COLUMNS)
    .from(callLog)
    .innerJoin(organization, eq(organization.id, callLog.organizationId))
    .innerJoin(workspace, eq(workspace.id, callLog.workspaceId))
    .leftJoin(user, eq(user.id, callLog.userId))
    .leftJoin(personalOrg, and(eq(personalOrg.ownerUserId, callLog.userId), eq(personalOrg.kind, "personal")))
    .leftJoin(oauthClient, eq(oauthClient.id, callLog.oauthClientId))
    .leftJoin(instance, eq(instance.id, callLog.instanceId))
    .leftJoin(apiEndpoint, eq(apiEndpoint.id, callLog.apiEndpointId))
    .leftJoin(integration, eq(integration.id, apiEndpoint.integrationId))
    .leftJoin(integrationOrg, eq(integrationOrg.id, integration.organizationId))
    .leftJoin(connection, eq(connection.id, callLog.connectionId))
    .leftJoin(connectionOrg, eq(connectionOrg.id, connection.organizationId));
}

type CallRow = Awaited<ReturnType<ReturnType<typeof callsQuery>["execute"]>>[number];

export type Person = { name: string; username: string | null; image: string | null } | null;
export type Agent = { host: string };

export type ActivityCall = {
  id: string;
  requestId: string | null;
  at: string; // ISO
  state: CallState;
  httpStatus: number | null;
  durationMs: number;
  // Built-in calls show as quiet lines; `lookup` is their text and
  // `lookupTool` the Zeqqat tool that was called (zeqqat_search...).
  lookup: string | null;
  lookupTool: string | null;
  toolName: string; // canonical for integration calls
  op: string | null;
  summary: string | null;
  kind: string | null;
  method: string | null;
  path: string | null;
  integrationRef: string | null; // @author/slug
  integrationSlug: string | null;
  instanceId: string | null;
  instanceAlias: string | null;
  instanceBaseUrl: string | null;
  connectionId: string | null;
  connectionName: string | null;
  connectionUrl: string | null;
  workspaceName: string;
  account: { username: string; type: string };
  inputs: unknown;
  response: unknown;
  outbound: unknown;
  errorMessage: string | null;
  redactions: number;
  policyName: string | null;
  policyVersion: number | null;
  callerRole: string | null;
  specRelease: string | null;
  reason: string | null;
  person: Person;
  agent: Agent;
};

const REDACTED_MARK = "[redacted by zeqqat]";

function toCall(r: CallRow): ActivityCall {
  const action = builtinAction(r.toolName);
  const responseText = r.responseBody == null ? "" : JSON.stringify(r.responseBody);
  return {
    id: r.id,
    requestId: r.requestId,
    at: r.createdAt.toISOString(),
    state: callState(r.outcome),
    httpStatus: r.httpStatus,
    durationMs: r.durationMs,
    lookup: action ? lookupText(action, r.requestArgs) : null,
    lookupTool: action ? builtinToolName(action) : null,
    toolName: r.toolName,
    op: r.op,
    summary: r.summary ?? r.path,
    kind: r.kind,
    method: r.method,
    path: r.path,
    integrationRef: r.integrationOrgSlug && r.integrationSlug ? `@${r.integrationOrgSlug}/${r.integrationSlug}` : null,
    integrationSlug: r.integrationSlug,
    instanceId: r.instanceId,
    instanceAlias: r.loggedAlias ?? r.instanceAlias,
    instanceBaseUrl: r.instanceBaseUrl,
    connectionId: r.connectionId,
    connectionName: r.connectionName,
    connectionUrl:
      r.connectionOrgSlug && r.connectionName && r.connectionShortId ? connectionUrl(r.connectionOrgSlug, r.connectionName, r.connectionShortId) : null,
    workspaceName: r.workspaceName,
    account: { username: r.accountSlug, type: r.accountKind === "personal" ? "personal" : "organization" },
    inputs: r.requestArgs,
    response: r.responseBody,
    outbound: r.outboundRequest,
    errorMessage: r.errorMessage,
    redactions: responseText.split(REDACTED_MARK).length - 1,
    policyName: r.policyName,
    policyVersion: r.policyVersion,
    callerRole: r.callerRole,
    specRelease: r.specRelease,
    reason: r.reason,
    person: r.userId ? { name: r.userName ?? "Someone", username: r.username, image: r.userImage } : null,
    agent: { host: r.clientId ? agentHost(r.clientId, r.clientName ?? "") : (r.clientName ?? "public connection") },
  };
}

// ---------- Request cards ----------

export type RequestCard = {
  id: string; // request id, or "call-<id>" for a call logged before requests existed
  href: string;
  reason: string;
  legacy: boolean;
  person: Person;
  agent: Agent;
  startedAt: string;
  lastAt: string;
  // Integration calls only; lookups don't count.
  states: CallState[];
  lookups: number;
  note: { tone: "blocked" | "error"; text: string } | null;
  blocked: { op: string; instanceAlias: string | null; connectionId: string | null } | null;
  connections: { id: string; name: string }[];
  integrations: { ref: string }[];
  instances: { id: string; alias: string }[];
};

function uniqBy<T>(items: T[], key: (t: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) {
    const k = key(i);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

function noteFor(calls: ActivityCall[]): RequestCard["note"] {
  const blocked = calls.find((c) => c.state === "blocked");
  if (blocked) {
    const policy = policyShortName(blocked.policyName);
    const op = blocked.op ?? blocked.toolName;
    return {
      tone: "blocked",
      text: policy ? `Stopped: ${op} is not on the ${policy} policy.` : (blocked.errorMessage ?? `Stopped: ${op} was not allowed.`),
    };
  }
  const failed = calls.find((c) => c.state === "error");
  if (failed) {
    const where = failed.instanceAlias ?? "The instance";
    return {
      tone: "error",
      text: failed.httpStatus ? `${where} answered ${failed.httpStatus}.` : (failed.errorMessage ?? `${failed.op ?? failed.toolName} failed.`),
    };
  }
  return null;
}

export function buildCard(id: string, reason: string, calls: ActivityCall[], legacy = false): RequestCard {
  const work = calls.filter((c) => !c.lookup);
  const first = calls[0];
  const blocked = work.find((c) => c.state === "blocked");
  return {
    id,
    href: legacy ? `/app/activity/call/${calls[0].id}` : `/app/activity/${id}`,
    reason,
    legacy,
    person: first.person,
    agent: first.agent,
    startedAt: first.at,
    lastAt: calls[calls.length - 1].at,
    states: work.map((c) => c.state),
    lookups: calls.length - work.length,
    note: noteFor(work),
    blocked: blocked ? { op: blocked.op ?? blocked.toolName, instanceAlias: blocked.instanceAlias, connectionId: blocked.connectionId } : null,
    connections: uniqBy(
      calls.filter((c) => c.connectionId && c.connectionName).map((c) => ({ id: c.connectionId!, name: c.connectionName! })),
      (c) => c.id,
    ),
    integrations: uniqBy(work.filter((c) => c.integrationRef).map((c) => ({ ref: c.integrationRef! })), (c) => c.ref),
    instances: uniqBy(
      work.filter((c) => c.instanceId && c.instanceAlias).map((c) => ({ id: c.instanceId!, alias: c.instanceAlias! })),
      (c) => c.id,
    ),
  };
}

export async function listRequests(
  v: Viewer,
  opts: {
    limit?: number;
    personUsername?: string;
    // Overview tiles: only requests with a call since this time, a blocked
    // call, or a response the scrubber redacted. They count the current
    // workspace, so these filters narrow to it too.
    since?: Date;
    show?: "blocked" | "redacted" | null;
  } = {},
): Promise<RequestCard[]> {
  const limit = opts.limit ?? 50;
  const narrowed = Boolean(opts.since || opts.show);
  const wsIds = narrowed ? [v.ws.workspaceId] : await visibleWorkspaceIds(v);
  const inView = inArray(callLog.workspaceId, wsIds);
  const callFilter = and(
    opts.since ? gte(callLog.createdAt, opts.since) : undefined,
    opts.show === "blocked" ? eq(callLog.outcome, "blocked") : undefined,
    opts.show === "redacted" ? sql`position(${REDACTED_MARK} in ${callLog.responseBody}::text) > 0` : undefined,
  );

  let personFilter = undefined;
  if (opts.personUsername) {
    const [p] = await db
      .select({ id: organization.ownerUserId })
      .from(organization)
      .where(and(eq(organization.slug, opts.personUsername), eq(organization.kind, "personal")))
      .limit(1);
    personFilter = eq(callLog.userId, p?.id ?? NO_ID);
  }

  const [grouped, legacy] = await Promise.all([
    db
      .select({ requestId: callLog.requestId, last: max(callLog.createdAt), first: min(callLog.createdAt) })
      .from(callLog)
      .where(and(inView, isNotNull(callLog.requestId), personFilter, callFilter))
      .groupBy(callLog.requestId)
      .orderBy(desc(max(callLog.createdAt)))
      .limit(limit),
    // Calls from before reasons were required: each is its own card.
    db
      .select({ id: callLog.id, at: callLog.createdAt })
      .from(callLog)
      .where(
        and(
          inView,
          isNull(callLog.requestId),
          personFilter,
          callFilter,
          notLike(callLog.toolName, "zeqqat\\_%"),
          notLike(callLog.toolName, "zeqqat-%"),
        ),
      )
      .orderBy(desc(callLog.createdAt))
      .limit(limit),
  ]);

  const requestIds = grouped.map((g) => g.requestId!).filter(Boolean);
  const [reqRows, groupedCalls, legacyCalls] = await Promise.all([
    requestIds.length
      ? db.select({ id: agentRequest.id, reason: agentRequest.reason }).from(agentRequest).where(inArray(agentRequest.id, requestIds))
      : Promise.resolve([]),
    requestIds.length
      ? callsQuery().where(and(inView, inArray(callLog.requestId, requestIds))).orderBy(asc(callLog.createdAt))
      : Promise.resolve([]),
    legacy.length ? callsQuery().where(inArray(callLog.id, legacy.map((l) => l.id))) : Promise.resolve([]),
  ]);

  const reasons = new Map(reqRows.map((r) => [r.id, r.reason]));
  const byRequest = new Map<string, ActivityCall[]>();
  for (const r of groupedCalls) {
    const c = toCall(r);
    const list = byRequest.get(c.requestId!) ?? [];
    list.push(c);
    byRequest.set(c.requestId!, list);
  }

  const cards: RequestCard[] = [];
  for (const g of grouped) {
    const calls = byRequest.get(g.requestId!);
    if (calls?.length) cards.push(buildCard(g.requestId!, reasons.get(g.requestId!) ?? "", calls));
  }
  for (const r of legacyCalls) {
    const c = toCall(r);
    cards.push(buildCard(`call-${c.id}`, c.summary ?? c.toolName, [c], true));
  }
  cards.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return cards.slice(0, limit);
}

// ---------- One request ----------

export async function getRequest(v: Viewer, requestId: string): Promise<{ card: RequestCard; calls: ActivityCall[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(requestId)) return null;
  const wsIds = await visibleWorkspaceIds(v);
  const [req] = await db.select().from(agentRequest).where(eq(agentRequest.id, requestId)).limit(1);
  if (!req) return null;
  const rows = await callsQuery()
    .where(and(eq(callLog.requestId, requestId), inArray(callLog.workspaceId, wsIds)))
    .orderBy(asc(callLog.createdAt));
  if (rows.length === 0) return null;
  const calls = rows.map(toCall);
  return { card: buildCard(requestId, req.reason, calls), calls };
}

// ---------- One call ----------

export async function getCall(
  v: Viewer,
  callId: string,
): Promise<{ call: ActivityCall; request: { id: string; reason: string } | null; index: number; total: number; prev: ActivityCall | null; next: ActivityCall | null } | null> {
  if (!/^[0-9a-f-]{36}$/.test(callId)) return null;
  const wsIds = await visibleWorkspaceIds(v);
  const [row] = await callsQuery()
    .where(and(eq(callLog.id, callId), inArray(callLog.workspaceId, wsIds)))
    .limit(1);
  if (!row) return null;
  const call = toCall(row);
  if (!call.requestId) return { call, request: null, index: 0, total: 1, prev: null, next: null };

  const [req] = await db.select({ id: agentRequest.id, reason: agentRequest.reason }).from(agentRequest).where(eq(agentRequest.id, call.requestId));
  // Prev/next step through the request's integration calls, skipping lookups.
  const siblings = (
    await callsQuery()
      .where(and(eq(callLog.requestId, call.requestId), inArray(callLog.workspaceId, wsIds)))
      .orderBy(asc(callLog.createdAt))
  )
    .map(toCall)
    .filter((c) => !c.lookup);
  const index = siblings.findIndex((c) => c.id === call.id);
  return {
    call,
    request: req ?? null,
    index: Math.max(index, 0),
    total: siblings.length || 1,
    prev: index > 0 ? siblings[index - 1] : null,
    next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
  };
}
