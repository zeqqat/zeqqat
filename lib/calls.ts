import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, callLog, instance, oauthClient } from "../db/schema";
import { CALL_SELECT } from "./overview";
import { agentHost } from "./permissions";
import { builtinAction } from "./tool-names";

export type CallLogRow = {
  id: string;
  toolName: string;
  outcome: string;
  httpStatus: number | null;
  durationMs: number;
  requestArgs: unknown;
  responseBody: unknown;
  errorMessage: string | null;
  createdAt: Date;
  instanceAlias: string | null;
  clientName: string | null;
  clientId: string | null;
  kind: string | null;
};

function query(where: ReturnType<typeof and>, limit: number) {
  return db
    .select(CALL_SELECT)
    .from(callLog)
    .leftJoin(instance, eq(instance.id, callLog.instanceId))
    .leftJoin(oauthClient, eq(oauthClient.id, callLog.oauthClientId))
    .leftJoin(apiEndpoint, eq(apiEndpoint.id, callLog.apiEndpointId))
    .where(where)
    .orderBy(desc(callLog.createdAt))
    .limit(limit);
}

export async function getCallsForAgent(workspaceId: string, oauthClientId: string, limit = 50): Promise<CallLogRow[]> {
  return query(and(eq(callLog.workspaceId, workspaceId), eq(callLog.oauthClientId, oauthClientId)), limit);
}

export async function getCallsForInstance(workspaceId: string, instanceId: string, limit = 50): Promise<CallLogRow[]> {
  return query(and(eq(callLog.workspaceId, workspaceId), eq(callLog.instanceId, instanceId)), limit);
}

export async function getCalls(workspaceId: string, limit = 200): Promise<CallLogRow[]> {
  return query(and(eq(callLog.workspaceId, workspaceId)), limit);
}

// What the activity list shows, ready for a client component: plain
// strings only. A run call's toolName is the endpoint's canonical name
// (@zeqqat/dokploy.http.application_deploy); built-in tools (zeqqat_search,
// or the older zeqqat-zeqqat-http-search-v1) are shown as what they do.
export type CallView = {
  id: string;
  title: string;
  agent: string;
  instance: string | null;
  kind: string | null;
  outcome: "ok" | "error" | "blocked" | "running";
  status: string;
  durationMs: number;
  createdAt: string;
  request: string;
  response: string;
  error: string | null;
  redactions: number;
};

// Keyed by built-in action, so both zeqqat_search and the older
// zeqqat-zeqqat-http-search-v1 in existing logs get the same label.
const BUILT_IN: Record<string, string> = {
  search: "searched the tool catalog",
  describe: "read a tool's description",
  whoami: "checked which instances it can use",
  run: "ran a tool",
  docs: "read the Zeqqat docs",
};

export function toCallView(c: CallLogRow): CallView {
  const outcome = (["ok", "error", "blocked", "running"].includes(c.outcome) ? c.outcome : "error") as CallView["outcome"];
  const action = builtinAction(c.toolName);
  const base = (action && BUILT_IN[action]) || c.toolName;
  const title = outcome === "blocked" ? `blocked: ${base} (not allowed)` : base;
  const response = c.responseBody != null ? JSON.stringify(c.responseBody, null, 2) : "";
  return {
    id: c.id,
    title,
    // No OAuth client at all means the call came through a public
    // connection, which has no sign-in.
    agent: c.clientId ? agentHost(c.clientId, c.clientName ?? "") : (c.clientName ?? "public (no sign-in)"),
    instance: c.instanceAlias,
    kind: c.kind,
    outcome,
    status: outcome === "running" ? "running" : outcome === "blocked" ? "not sent" : c.httpStatus ? String(c.httpStatus) : outcome === "ok" ? "done" : "error",
    durationMs: c.durationMs,
    createdAt: c.createdAt.toISOString(),
    request: JSON.stringify(c.requestArgs ?? {}, null, 2),
    response,
    error: c.errorMessage,
    redactions: response.split("[redacted by zeqqat]").length - 1,
  };
}
