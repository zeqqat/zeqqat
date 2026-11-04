import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, callLog, integration, organization } from "../db/schema";
import { docSection, docsIndex, searchDocs } from "./agent-docs";
import { endpointNames, findEndpoints, integrationRef, type FoundEndpoint } from "./catalog";
import { capJson } from "./call-log";
import type { McpContext } from "./mcp-auth";
import { reachableInstances, type ReachableInstance } from "./mcp-context";
import { newId } from "./id";
import { runEndpoint, toolError, toolOk, type ToolResult } from "./executor";
import { accessSummary, toolAllowed } from "./policies";
import { builtinToolName } from "./tool-names";

// The built-in tools, the only ones in tools/list. Built via
// builtinToolName so they always pass Claude's client-side name check
// (^[a-zA-Z0-9_-]{1,64}$ on mcp__<connector>__<name>); see
// lib/tool-names.ts. Catalog tools are never listed: agents find them with
// zeqqat_search and call them through zeqqat_run.
export const TOOL_NAMES = {
  search: builtinToolName("search"),
  describe: builtinToolName("describe"),
  run: builtinToolName("run"),
  whoami: builtinToolName("whoami"),
  docs: builtinToolName("docs"),
  policy: builtinToolName("policy"),
} as const;

type Ctx = McpContext;

// inArray with an empty list is invalid SQL; this id never matches.
const NO_ID = "00000000-0000-0000-0000-000000000000";

// Every built-in tool logs through here, so the dashboard's call history
// shows every tool an agent used. requestArgs/responseBody feed the
// per-call JSON view; both go through capJson so one large result can't
// bloat the row.
async function logCall(
  ctx: Ctx,
  fields: { toolName: string; outcome: "ok" | "error"; requestArgs: unknown; responseBody?: unknown; errorMessage?: string },
) {
  await db.insert(callLog).values({
    id: newId(),
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
    oauthClientId: ctx.oauthClientId,
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    requestId: ctx.requestId ?? null,
    reason: ctx.reason ?? null,
    callerRole: ctx.callerRole,
    toolName: fields.toolName,
    outcome: fields.outcome,
    durationMs: 0,
    requestArgs: capJson(fields.requestArgs),
    responseBody: capJson(fields.responseBody),
    errorMessage: fields.errorMessage,
  });
}

async function logged(ctx: Ctx, toolName: string, requestArgs: unknown, result: ToolResult): Promise<ToolResult> {
  await logCall(ctx, {
    toolName,
    outcome: result.ok ? "ok" : "error",
    requestArgs,
    responseBody: result.ok ? result.data : null,
    errorMessage: result.ok ? undefined : result.text,
  });
  return result;
}

// The instances where this tool, from this integration, may run for this
// caller: by the attached policy's allow list, or by kind.
function allowedOn(instances: ReachableInstance[], integrationId: string, tool: { name: string; kind: string }): string[] {
  return instances.filter((i) => i.integrationId === integrationId && toolAllowed(i.access, tool)).map((i) => i.alias);
}

function instanceNames(instances: ReachableInstance[]): string {
  return instances.length ? instances.map((i) => i.alias).join(", ") : "none yet (the user adds instances in the Zeqqat dashboard)";
}

export async function toolSearch(ctx: Ctx, args: { query?: string; limit?: number }): Promise<ToolResult> {
  const query = (args.query ?? "").trim();
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
  const requestArgs = { query, limit };
  const instances = await reachableInstances(ctx);
  const integrationIds = [...new Set(instances.map((i) => i.integrationId))];
  const scope = inArray(apiEndpoint.integrationId, integrationIds.length ? integrationIds : [NO_ID]);

  // Matches the operationId, the action segment, the summary, the path and
  // the spec tags, so a category from the context finds its tools.
  const like = `%${query}%`;
  const rows = query
    ? await db
        .select({
          operationId: apiEndpoint.name,
          action: apiEndpoint.action,
          summary: apiEndpoint.summary,
          path: apiEndpoint.path,
          kind: apiEndpoint.kind,
          integrationId: apiEndpoint.integrationId,
          integrationSlug: integration.slug,
          integrationTitle: integration.name,
          orgSlug: organization.slug,
        })
        .from(apiEndpoint)
        .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
        .innerJoin(organization, eq(organization.id, integration.organizationId))
        .where(
          and(
            scope,
            isNull(apiEndpoint.removedAt),
            or(
              ilike(apiEndpoint.name, like),
              ilike(apiEndpoint.action, `%${query.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}%`),
              ilike(apiEndpoint.summary, like),
              ilike(apiEndpoint.path, like),
              sql`exists (select 1 from jsonb_array_elements_text(${apiEndpoint.tags}) as t(tag) where t.tag ilike ${like})`,
            ),
          ),
        )
        .orderBy(integration.slug, apiEndpoint.name)
        .limit(limit)
    : [];

  if (rows.length === 0) {
    // Never return a flat empty result: say what is connected so the
    // model learns the vocabulary, or knows the integration is missing.
    const connected = [...new Set(instances.map((i) => integrationRef(i.integrationOrgSlug, i.integrationSlug)))];
    const text = connected.length
      ? `No matches for "${query}". Connected integrations: ${connected.join(", ")}. Try a broader term (deploy, logs, stop), or ask zeqqat_docs.`
      : `No matches for "${query}", and no instances are reachable through this connection yet.`;
    return logged(ctx, TOOL_NAMES.search, requestArgs, toolOk({ matches: [], integrations: connected }, text));
  }

  const matches = rows.map((r) => ({
    operationId: r.operationId,
    canonical: endpointNames({ name: r.operationId, action: r.action }, r.orgSlug, r.integrationSlug).canonical,
    integration: integrationRef(r.orgSlug, r.integrationSlug),
    kind: r.kind,
    summary: r.summary ?? r.path,
    allowedOn: allowedOn(instances, r.integrationId, { name: r.operationId, kind: r.kind }),
  }));
  const text = matches
    .map(
      (m) =>
        `${m.operationId} (${m.integration}, ${m.kind}; ${m.allowedOn.length ? `runs on: ${m.allowedOn.join(", ")}` : "not allowed on any instance here"}): ${m.summary}`,
    )
    .join("\n");
  return logged(ctx, TOOL_NAMES.search, requestArgs, toolOk({ matches }, text));
}

function describeEndpoint(e: FoundEndpoint, instances: ReachableInstance[]) {
  const names = endpointNames(e, e.orgSlug, e.integrationSlug);
  return {
    operationId: names.operationId,
    canonical: names.canonical,
    pagePath: names.pagePath,
    integration: integrationRef(e.orgSlug, e.integrationSlug),
    kind: e.kind,
    method: e.method,
    path: e.path,
    summary: e.summary,
    description: e.description,
    inputSchema: e.inputSchema,
    outputSchema: e.outputSchema,
    allowedOn: allowedOn(instances, e.integrationId, { name: e.name, kind: e.kind }),
  };
}

export async function toolDescribe(ctx: Ctx, args: { name?: string; instance?: string }): Promise<ToolResult> {
  const requestArgs = { name: args.name ?? null, instance: args.instance ?? null };
  if (!args.name) return logged(ctx, TOOL_NAMES.describe, requestArgs, toolError("name is required: an operationId from zeqqat_search."));

  const instances = await reachableInstances(ctx);
  let integrationIds = [...new Set(instances.map((i) => i.integrationId))];
  if (args.instance) {
    const inst = instances.find((i) => i.alias === args.instance);
    if (!inst) {
      return logged(
        ctx,
        TOOL_NAMES.describe,
        requestArgs,
        toolError(`No instance called "${args.instance}" on this connection. Instances you can use: ${instanceNames(instances)}.`),
      );
    }
    integrationIds = [inst.integrationId];
  }

  const found = await findEndpoints(args.name, integrationIds);
  if (found.length === 0) {
    return logged(
      ctx,
      TOOL_NAMES.describe,
      requestArgs,
      toolError(`No tool named "${args.name}" reachable through this connection. Use zeqqat_search to find the operationId.`),
    );
  }
  if (found.length > 1) {
    const options = found.map((e) => endpointNames(e, e.orgSlug, e.integrationSlug).canonical).join(", ");
    return logged(
      ctx,
      TOOL_NAMES.describe,
      requestArgs,
      toolError(`"${args.name}" exists in more than one integration: ${options}. Pass an instance, or one of these canonical names.`),
    );
  }
  return logged(ctx, TOOL_NAMES.describe, requestArgs, toolOk(describeEndpoint(found[0], instances)));
}

export async function toolRun(
  ctx: Ctx,
  args: { name?: string; instance?: string; inputs?: Record<string, unknown> },
): Promise<ToolResult> {
  if (!args.name || !args.instance) {
    const instances = await reachableInstances(ctx);
    return toolError(
      `name and instance are both required. name is an operationId from zeqqat_search; instance is one of: ${instanceNames(instances)}.`,
    );
  }
  return runEndpoint(ctx, { endpointName: args.name, instanceAlias: args.instance, inputs: args.inputs ?? {} });
}

// The context alone. lib/mcp-server.ts puts the full context (never the
// shortened one) in front of this result.
export async function toolWhoami(ctx: Ctx): Promise<ToolResult> {
  return logged(
    ctx,
    TOOL_NAMES.whoami,
    {},
    toolOk(null, "Above is your Zeqqat context: what this connection reaches and what you may do on each instance."),
  );
}

export async function toolDocs(ctx: Ctx, args: { question?: string; section?: string }): Promise<ToolResult> {
  const requestArgs = { question: args.question ?? null, section: args.section ?? null };
  if (args.section) {
    const s = docSection(args.section);
    if (s) return logged(ctx, TOOL_NAMES.docs, requestArgs, toolOk({ passages: [s] }, `${s.title} (${s.url})\n${s.text}`));
  }
  const question = (args.question ?? "").trim();
  const passages = question ? await searchDocs(question) : [];
  if (passages.length === 0) {
    const index = docsIndex();
    return logged(
      ctx,
      TOOL_NAMES.docs,
      requestArgs,
      toolOk(
        { passages: [], index },
        `${question ? `Nothing matched "${question}". ` : ""}Sections: ${index.map((s) => `${s.section} (${s.title})`).join(", ")}. Ask a question, or pass a section.`,
      ),
    );
  }
  return logged(
    ctx,
    TOOL_NAMES.docs,
    requestArgs,
    toolOk({ passages }, passages.map((p) => `${p.title} (${p.url})\n${p.text}`).join("\n\n")),
  );
}

// The policies on this connection, per instance: the full allow list, so
// the model can tell the user exactly what it may and may not do. The
// token decides the scope; an optional instance narrows it.
export async function toolPolicy(ctx: Ctx, args: { instance?: string }): Promise<ToolResult> {
  const requestArgs = { instance: args.instance ?? null };
  const instances = await reachableInstances(ctx);
  const picked = args.instance ? instances.filter((i) => i.alias === args.instance) : instances;
  if (args.instance && picked.length === 0) {
    return logged(
      ctx,
      TOOL_NAMES.policy,
      requestArgs,
      toolError(`No instance called "${args.instance}" on this connection. Instances you can use: ${instanceNames(instances)}.`),
    );
  }
  const policies = picked.map((i) => {
    const base = { instance: i.alias, integration: integrationRef(i.integrationOrgSlug, i.integrationSlug), summary: accessSummary(i.access) };
    if (i.access.mode === "policy") {
      const p = i.access.policy;
      return {
        ...base,
        mode: "policy" as const,
        policy: p.canonical,
        version: p.version,
        spec: p.specRelease,
        allow: p.allow,
        note: "Only the tools in allow can run on this instance; everything else is denied. Your role can still limit it by kind.",
      };
    }
    if (i.access.mode === "kinds") {
      const kinds = (["read", "create", "edit", "delete"] as const).filter((k) => i.access.mode === "kinds" && i.access.perm[k]);
      return { ...base, mode: "kinds" as const, policy: null, allowedKinds: kinds, note: "No policy attached: tools are allowed by kind." };
    }
    return { ...base, mode: "none" as const, policy: null };
  });
  const text = policies
    .map((p) =>
      p.mode === "policy"
        ? `${p.instance}: ${p.policy} (v${p.version}). ${p.summary} Allows: ${p.allow.join(", ") || "nothing"}.`
        : `${p.instance}: ${p.summary}`,
    )
    .join("\n");
  return logged(ctx, TOOL_NAMES.policy, requestArgs, toolOk({ policies }, text || "This connection reaches no instances yet."));
}
