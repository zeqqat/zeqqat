import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { callLog, instance, integrationApiSpecSnapshot } from "../db/schema";
import { endpointNames, findEndpoint } from "./catalog";
import { capJson } from "./call-log";
import type { McpContext } from "./mcp-auth";
import { reachableInstances } from "./mcp-context";
import { accessFor, toolAllowed, type InstanceAccess } from "./policies";
import { decryptCredential } from "./crypto";
import { newId } from "./id";
import { REDACTED, scrubSecrets } from "./scrub";

// Who edits policies, by the owning account's type: a personal account
// has exactly one owner; an organization has owners.
export function policyEditors(ctx: Pick<McpContext, "organizationSlug" | "organizationKind">): string {
  return ctx.organizationKind === "personal"
    ? `the owner, @${ctx.organizationSlug}`
    : `an owner of @${ctx.organizationSlug}`;
}

type Ctx = Pick<
  McpContext,
  | "organizationId"
  | "organizationSlug"
  | "organizationKind"
  | "workspaceId"
  | "oauthClientId"
  | "userId"
  | "connectionId"
  | "callerRole"
  | "reason"
  | "requestId"
>;

// What every built-in tool returns. lib/mcp-server.ts turns it into an
// MCP result: the context first, then `text`, with `data` as
// structuredContent.result on success. Errors are text only.
export type ToolResult = { ok: true; text: string; data: unknown } | { ok: false; text: string };

export function toolOk(data: unknown, text?: string): ToolResult {
  return { ok: true, data, text: text ?? JSON.stringify(data, null, 2) };
}

export function toolError(text: string): ToolResult {
  return { ok: false, text };
}

// A very small number of addresses that stay blocked even for an instance
// the workspace owner explicitly configured — the cloud metadata endpoint
// is the one SSRF target dangerous enough to deny unconditionally. Beyond
// that, instance.baseUrl is owner-entered trusted data, never
// model-supplied, so there's no attacker-controlled redirect surface here
// the way there would be if `args` could influence the request target.
const ALWAYS_BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

// What the log records about the call's setting, copied at call time so
// later changes (a renamed instance, an edited policy) don't rewrite history.
type CallSetting = {
  instanceAlias?: string | null;
  policyName?: string | null;
  policyVersion?: number | null;
  specRelease?: string | null;
};

async function logCall(
  ctx: Ctx,
  fields: CallSetting & {
    toolName: string;
    instanceId: string | null;
    apiEndpointId: string | null;
    outcome: "running" | "ok" | "error" | "blocked";
    httpStatus?: number;
    durationMs: number;
    requestArgs?: unknown;
    responseBody?: unknown;
    errorMessage?: string;
    outboundRequest?: unknown;
  },
): Promise<string> {
  const id = newId();
  await db.insert(callLog).values({
    id,
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
    oauthClientId: ctx.oauthClientId,
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    requestId: ctx.requestId ?? null,
    reason: ctx.reason ?? null,
    callerRole: ctx.callerRole,
    toolName: fields.toolName,
    instanceId: fields.instanceId,
    instanceAlias: fields.instanceAlias ?? null,
    apiEndpointId: fields.apiEndpointId,
    policyName: fields.policyName ?? null,
    policyVersion: fields.policyVersion ?? null,
    specRelease: fields.specRelease ?? null,
    outcome: fields.outcome,
    httpStatus: fields.httpStatus,
    durationMs: fields.durationMs,
    requestArgs: capJson(fields.requestArgs),
    responseBody: capJson(fields.responseBody),
    outboundRequest: fields.outboundRequest === undefined ? null : capJson(fields.outboundRequest),
    errorMessage: fields.errorMessage,
  });
  return id;
}

// The one update a log row ever gets: a running call reaching its outcome.
async function finishCall(
  id: string,
  fields: { outcome: "ok" | "error"; httpStatus?: number; durationMs: number; responseBody?: unknown; errorMessage?: string },
) {
  await db
    .update(callLog)
    .set({
      outcome: fields.outcome,
      httpStatus: fields.httpStatus,
      durationMs: fields.durationMs,
      responseBody: capJson(fields.responseBody),
      errorMessage: fields.errorMessage,
    })
    .where(eq(callLog.id, id));
}

function policyOf(access: InstanceAccess): Pick<CallSetting, "policyName" | "policyVersion"> {
  return access.mode === "policy"
    ? { policyName: access.policy.canonical, policyVersion: access.policy.version }
    : { policyName: null, policyVersion: null };
}

async function releaseOf(snapshotId: string | null): Promise<string | null> {
  if (!snapshotId) return null;
  const snap = await db.query.integrationApiSpecSnapshot.findFirst({
    where: eq(integrationApiSpecSnapshot.id, snapshotId),
    columns: { release: true },
  });
  return snap?.release ?? null;
}

// The outbound request as stored and shown on the call page. The
// credential header is listed by name; its value never reaches the log.
export function describeOutbound(
  method: string,
  url: URL,
  body: string | undefined,
  credentialHeader: string,
): Record<string, unknown> {
  const base = `${url.origin}${url.pathname}`;
  const query = Object.fromEntries(url.searchParams.entries());
  const out: Record<string, unknown> = { method, url: base };
  if (Object.keys(query).length) out.query = query;
  if (body !== undefined) out.body = scrubSecrets(safeJson(body) ?? body);
  out.headers = { [credentialHeader.toLowerCase()]: REDACTED, "content-type": "application/json" };
  return out;
}

function credentialHeaderName(scheme: { type: string; in?: string; name?: string }): string {
  if (scheme.type === "apiKey" && scheme.in === "header" && scheme.name) return scheme.name;
  return "Authorization";
}

// Re-checked on every call, never cached from tools/list (spec section 8:
// "tools/list happens once at connect... a grant revoked mid conversation
// must fail as isError, not as a protocol error"). The connection's policy
// for this instance, narrowed by the caller's workspace role (or the
// public cap).
async function checkAccess(ctx: Ctx, instanceId: string, tool: { name: string; kind: string }) {
  const access = await accessFor(ctx.connectionId, instanceId, ctx.callerRole);
  return { access, allowed: toolAllowed(access, tool) };
}

function buildRequest(baseUrl: string, endpoint: { method: string; path: string; pathParams: string[] }, inputs: Record<string, unknown>) {
  const url = new URL(endpoint.path, baseUrl);
  const remaining = { ...inputs };
  for (const p of endpoint.pathParams) delete remaining[p];

  let body: string | undefined;
  if (endpoint.method === "GET" || endpoint.method === "DELETE") {
    for (const [k, v] of Object.entries(remaining)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  } else {
    body = JSON.stringify(remaining);
  }
  return { url, body };
}

function applyCredential(
  headers: Headers,
  scheme: { type: string; in?: string; name?: string },
  secret: string,
) {
  if (scheme.type === "apiKey" && scheme.in === "header" && scheme.name) {
    headers.set(scheme.name, secret);
  } else if (scheme.type === "bearer") {
    headers.set("Authorization", `Bearer ${secret}`);
  } else {
    headers.set("Authorization", secret);
  }
}

export async function runEndpoint(
  ctx: Ctx,
  params: { endpointName: string; instanceAlias: string; inputs: Record<string, unknown> },
): Promise<ToolResult> {
  const start = Date.now();

  const inst = await db.query.instance.findFirst({
    where: and(eq(instance.workspaceId, ctx.workspaceId), eq(instance.alias, params.instanceAlias)),
  });
  if (!inst) {
    await logCall(ctx, {
      toolName: params.endpointName,
      instanceId: null,
      instanceAlias: params.instanceAlias,
      apiEndpointId: null,
      outcome: "error",
      durationMs: Date.now() - start,
      requestArgs: params.inputs,
      errorMessage: "instance not found",
    });
    const names = (await reachableInstances(ctx)).map((i) => i.alias);
    return toolError(
      `No instance called "${params.instanceAlias}" on this connection. ` +
        (names.length ? `Instances you can use: ${names.join(", ")}.` : "This connection has no instances yet; the user adds them in the Zeqqat dashboard."),
    );
  }

  // The endpoint comes from the instance's own integration, so two
  // integrations (or two orgs' copies of one) can share endpoint names.
  // Any form of the tool's name works (wire, canonical, dotted, or the raw
  // operationId). Endpoints gone from the latest spec are not callable.
  const endpoint = await findEndpoint(params.endpointName, [inst.integrationId]);
  if (!endpoint) {
    return toolError(`"${inst.alias}" has no tool called "${params.endpointName}". Use zeqqat_search to find the operationId.`);
  }
  // From here on the call is logged under the tool's canonical name,
  // whatever form the agent used.
  const toolName = endpointNames(endpoint, endpoint.orgSlug, endpoint.integrationSlug).canonical;

  const { access, allowed } = await checkAccess(ctx, inst.id, { name: endpoint.name, kind: endpoint.kind });
  const setting: CallSetting = { instanceAlias: inst.alias, ...policyOf(access), specRelease: await releaseOf(endpoint.lastSnapshotId) };
  const base = { ...setting, toolName, instanceId: inst.id, apiEndpointId: endpoint.id, requestArgs: params.inputs };

  if (!allowed) {
    const byPolicy = access.mode === "policy" && !access.policy.allow.includes(endpoint.name);
    const why = byPolicy
      ? `${endpoint.name} isn't on the policy ${access.mode === "policy" ? access.policy.canonical : ""} attached to "${inst.alias}"`
      : `${endpoint.kind} on "${inst.alias}" isn't allowed through this connection${ctx.callerRole === "public" ? " (public connections are read only)" : ctx.callerRole !== "admin" ? ` for your role (${ctx.callerRole})` : ""}`;
    await logCall(ctx, { ...base, outcome: "blocked", durationMs: Date.now() - start, errorMessage: `Not sent: ${why}.` });
    return toolError(
      `Not sent: ${why}. Tell the user; a workspace admin can change it in Connections${byPolicy ? `, and ${policyEditors(ctx)} can edit the policy in Policies` : ""}. ` +
        `Call zeqqat_policy to see what is allowed, or zeqqat_docs (question: "why was my call denied").`,
    );
  }

  const missing = ((endpoint.inputSchema as { required?: string[] })?.required ?? []).filter(
    (key) => params.inputs[key] === undefined,
  );
  if (missing.length > 0) {
    await logCall(ctx, {
      ...base,
      outcome: "error",
      durationMs: Date.now() - start,
      errorMessage: `Missing required input(s): ${missing.join(", ")}`,
    });
    return toolError(`Missing required input(s): ${missing.join(", ")}. Use zeqqat_describe to see the input schema.`);
  }

  let targetHost: string;
  try {
    targetHost = new URL(inst.baseUrl).hostname;
  } catch {
    await logCall(ctx, { ...base, outcome: "error", durationMs: Date.now() - start, errorMessage: "invalid base URL" });
    return toolError(`Instance "${inst.alias}" has an invalid base URL. The user can fix it in the Zeqqat dashboard.`);
  }
  if (ALWAYS_BLOCKED_HOSTS.has(targetHost)) {
    await logCall(ctx, { ...base, outcome: "blocked", durationMs: Date.now() - start, errorMessage: "blocked host" });
    return toolError("This target is blocked for safety.");
  }

  const scheme = endpoint.credentialScheme as { type: string; in?: string; name?: string };
  const { url, body } = buildRequest(inst.baseUrl, endpoint, params.inputs);
  const headers = new Headers({ "content-type": "application/json" });
  applyCredential(headers, scheme, decryptCredential(inst.credential));

  // Logged as running before the request goes out, so a slow call shows
  // in Activity while it is in flight; finishCall records the outcome.
  const callId = await logCall(ctx, {
    ...base,
    outcome: "running",
    durationMs: 0,
    outboundRequest: describeOutbound(endpoint.method, url, body, credentialHeaderName(scheme)),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url.toString(), {
      method: endpoint.method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    const durationMs = Date.now() - start;

    // Scrubbed before it reaches the agent, never after — whatever is
    // returned here is what ends up in a model's context, and it's also
    // exactly what gets logged below, so the stored responseBody always
    // matches what the agent actually saw.
    const scrubbedText = scrubSecrets(text);
    const parsed = safeJson(text);
    const scrubbedParsed = parsed !== undefined ? scrubSecrets(parsed) : undefined;

    await finishCall(callId, {
      outcome: res.ok ? "ok" : "error",
      httpStatus: res.status,
      durationMs,
      responseBody: scrubbedParsed ?? scrubbedText,
    });

    if (!res.ok) {
      // Prefer the parsed body: field-name redaction only works on objects, so
      // raw JSON text can still carry {"password":"..."} through.
      const shown = scrubbedParsed !== undefined ? JSON.stringify(scrubbedParsed) : scrubbedText;
      return toolError(`${inst.alias} returned HTTP ${res.status}: ${shown.slice(0, 500)}`);
    }

    if (scrubbedParsed !== undefined) {
      return toolOk(scrubbedParsed, JSON.stringify(scrubbedParsed).slice(0, 8000));
    }
    return toolOk(scrubbedText.slice(0, 8000), scrubbedText.slice(0, 8000));
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = scrubSecrets(err instanceof Error ? err.message : String(err));
    await finishCall(callId, { outcome: "error", durationMs, errorMessage: message });
    return toolError(`Could not reach ${inst.alias}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
