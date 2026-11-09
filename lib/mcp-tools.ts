import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, callLog, integration, organization } from "../db/schema";
import { docSection, docsIndex, searchDocs } from "./agent-docs";
import { endpointNames, findEndpoint, findEndpoints, integrationRef, type FoundEndpoint } from "./catalog";
import { activeKeywords, endpointsWithKeywords, learnFromRun } from "./keywords";
import { prefilterTerms, queryWords, rank } from "./search-rank";
import { capJson } from "./call-log";
import type { McpContext } from "./mcp-auth";
import { reachableInstances, type ReachableInstance } from "./mcp-context";
import { newId } from "./id";
import { runEndpoint, toolError, toolOk, type ToolResult } from "./executor";
import { accessSummary, toolAllowed } from "./policies";
import { builtinToolName } from "./tool-names";
import { mintGenerated, type GenerateKind } from "./secret-handles";
import { ImportError, importFromUrl } from "./spec-import";
import { submitSuggestion } from "./feedback";
import { CHECKABLE_PORTS, checkAddress, checkPort } from "./reachability";
import { edition } from "./edition";

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
  secret: builtinToolName("secret"),
  import: builtinToolName("import"),
  feedback: builtinToolName("feedback"),
  check: builtinToolName("check"),
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

  // Each query word is matched on its own (lib/search-rank.ts), so
  // "deploy application" finds application.deploy. SQL narrows to tools
  // containing any form of any word (operationId, action, summary, path,
  // tags) or having it as a learned keyword (lib/keywords.ts); ranking
  // keeps real word matches and orders them.
  const qw = queryWords(query);
  const terms = prefilterTerms(qw);
  const byKeyword = await endpointsWithKeywords(qw.flatMap((q) => q.direct));
  const anyTerm = terms.flatMap((t) => {
    const like = `%${t}%`;
    return [
      ilike(apiEndpoint.name, like),
      ilike(apiEndpoint.action, like),
      ilike(apiEndpoint.summary, like),
      ilike(apiEndpoint.path, like),
      sql`exists (select 1 from jsonb_array_elements_text(${apiEndpoint.tags}) as t(tag) where t.tag ilike ${like})`,
    ];
  });
  if (byKeyword.length) anyTerm.push(inArray(apiEndpoint.id, byKeyword));
  const candidates = terms.length
    ? await db
        .select({
          id: apiEndpoint.id,
          operationId: apiEndpoint.name,
          action: apiEndpoint.action,
          summary: apiEndpoint.summary,
          path: apiEndpoint.path,
          tags: apiEndpoint.tags,
          kind: apiEndpoint.kind,
          integrationId: apiEndpoint.integrationId,
          integrationSlug: integration.slug,
          integrationTitle: integration.name,
          orgSlug: organization.slug,
        })
        .from(apiEndpoint)
        .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
        .innerJoin(organization, eq(organization.id, integration.organizationId))
        .where(and(scope, isNull(apiEndpoint.removedAt), or(...anyTerm)))
        .limit(2000)
    : [];
  const keywords = await activeKeywords(candidates.map((c) => c.id));
  const rows = rank(
    qw,
    candidates.map((c) => ({ ...c, name: c.operationId, keywords: keywords.get(c.id) ?? [] })),
  )
    .slice(0, limit)
    .map((r) => r.item);

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
  const result = await runEndpoint(ctx, { endpointName: args.name, instanceAlias: args.instance, inputs: args.inputs ?? {} });
  if (result.ok && ctx.requestId) await learnAfterRun(ctx, args.name, args.instance);
  return result;
}

// The searches earlier in this request that missed this tool teach it new
// keywords (lib/keywords.ts).
async function learnAfterRun(ctx: Ctx, name: string, alias: string) {
  const inst = (await reachableInstances(ctx)).find((i) => i.alias === alias);
  if (!inst) return;
  const e = await findEndpoint(name, [inst.integrationId]);
  if (!e) return;
  await learnFromRun(ctx, {
    id: e.id,
    name: e.name,
    summary: e.summary,
    path: e.path,
    tags: e.tags,
    keywords: [],
    integrationRef: integrationRef(e.orgSlug, e.integrationSlug),
  });
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

// A fresh random secret the agent can use without seeing: a database
// password, a signing key. Returns only a handle (lib/secret-handles.ts);
// the value is filled in when the handle goes into a zeqqat_run input, and
// lives on only where it was written.
const SECRET_KINDS: GenerateKind[] = ["password", "base64", "hex"];

export async function toolSecret(ctx: Ctx, args: { kind?: string; length?: number }): Promise<ToolResult> {
  const kind = (args.kind ?? "password") as GenerateKind;
  const length = args.length ?? 32;
  const requestArgs = { kind, length };
  if (ctx.callerRole === "public" || ctx.callerRole === "viewer") {
    return logged(ctx, TOOL_NAMES.secret, requestArgs, toolError("This connection is read only, so it can't create secrets."));
  }
  if (!SECRET_KINDS.includes(kind)) {
    return logged(ctx, TOOL_NAMES.secret, requestArgs, toolError(`kind must be one of: ${SECRET_KINDS.join(", ")}.`));
  }
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    return logged(ctx, TOOL_NAMES.secret, requestArgs, toolError("length must be a whole number from 16 to 128."));
  }
  const { handle, expiresAt } = await mintGenerated(ctx.connectionId, kind, length);
  return logged(
    ctx,
    TOOL_NAMES.secret,
    requestArgs,
    toolOk(
      { handle, kind, length, expiresAt },
      `Created ${handle} (${kind}, ${length}${kind === "password" ? " characters" : " bytes"}). Put it in zeqqat_run inputs wherever the value belongs, in an env block or a password, token or key field, alone or inside a string. Use the same handle everywhere the same value is needed. It binds to the first instance it is used on and expires at ${expiresAt}.`,
    ),
  );
}

// Adds an app to this connection's account from a link to its OpenAPI spec
// (lib/spec-import.ts). Workspace admins only: an import changes the
// account's catalog. The tools become usable once someone adds an instance
// with the app's key in the dashboard, so no key ever passes through here.
export async function toolImport(
  ctx: Ctx,
  args: { spec_url?: string; docs_url?: string; name?: string },
): Promise<ToolResult> {
  const requestArgs = { spec_url: args.spec_url, docs_url: args.docs_url, name: args.name };
  if (ctx.callerRole !== "admin") {
    return logged(ctx, TOOL_NAMES.import, requestArgs, toolError("Only a workspace admin can add apps. Ask an admin, or add it in the Zeqqat dashboard."));
  }
  if (typeof args.spec_url !== "string" || !args.spec_url.trim()) {
    return logged(ctx, TOOL_NAMES.import, requestArgs, toolError("spec_url is required: a link to the app's OpenAPI spec (JSON or YAML)."));
  }
  try {
    const r = await importFromUrl({
      organizationId: ctx.organizationId,
      orgSlug: ctx.organizationSlug,
      specUrl: args.spec_url,
      docsUrl: args.docs_url ?? null,
      name: args.name ?? null,
    });
    const data = {
      integration: r.ref,
      name: r.name,
      updated: r.updated,
      tools: r.endpoints,
      added: r.added,
      removed: r.removed,
      kinds: r.kinds,
      baseUrl: r.baseUrl,
      warnings: r.warnings.slice(0, 10),
    };
    const text =
      `${r.updated ? "Updated" : "Added"} ${r.ref} (${r.name}) with ${r.endpoints} tools: ` +
      `${r.kinds.read} read, ${r.kinds.create} create, ${r.kinds.edit} edit, ${r.kinds.delete} delete. ` +
      "Kinds are guessed from each endpoint's method and name; anything that looks destructive is marked delete. " +
      `To use it, the user adds an instance in the Zeqqat dashboard (Integrations) with the app's URL${r.baseUrl ? ` (${r.baseUrl})` : ""} and API key, then attaches it to this connection.`;
    return logged(ctx, TOOL_NAMES.import, requestArgs, toolOk(data, text));
  } catch (err) {
    const msg = err instanceof ImportError ? err.message : "The import failed. Check the link and try again.";
    if (!(err instanceof ImportError)) console.error("[zeqqat] import failed:", err);
    return logged(ctx, TOOL_NAMES.import, requestArgs, toolError(msg));
  }
}

// A better one-line summary for a tool, for its publisher to review
// (lib/feedback.ts). Nothing changes until a person accepts it.
export async function toolFeedback(
  ctx: Ctx,
  args: { name?: string; instance?: string; summary?: string; note?: string },
): Promise<ToolResult> {
  const summary = (args.summary ?? "").trim().replace(/\s+/g, " ");
  const note = (args.note ?? "").trim() || null;
  const requestArgs = { name: args.name ?? null, instance: args.instance ?? null, summary, note };
  if (!args.name || !summary) {
    return logged(ctx, TOOL_NAMES.feedback, requestArgs, toolError("name (an operationId from zeqqat_search) and summary are required."));
  }
  const instances = await reachableInstances(ctx);
  let integrationIds = [...new Set(instances.map((i) => i.integrationId))];
  if (args.instance) {
    const inst = instances.find((i) => i.alias === args.instance);
    if (!inst) {
      return logged(
        ctx,
        TOOL_NAMES.feedback,
        requestArgs,
        toolError(`No instance called "${args.instance}" on this connection. Instances you can use: ${instanceNames(instances)}.`),
      );
    }
    integrationIds = [inst.integrationId];
  }
  const found = await findEndpoints(args.name, integrationIds);
  if (found.length !== 1) {
    return logged(
      ctx,
      TOOL_NAMES.feedback,
      requestArgs,
      toolError(
        found.length
          ? `"${args.name}" exists in more than one integration. Pass an instance.`
          : `No tool named "${args.name}" reachable through this connection. Use zeqqat_search to find the operationId.`,
      ),
    );
  }
  const e = found[0];
  const sent = await submitSuggestion(ctx, e, summary, note);
  if (!sent.ok) return logged(ctx, TOOL_NAMES.feedback, requestArgs, toolError(sent.error));
  const ref = integrationRef(e.orgSlug, e.integrationSlug);
  return logged(
    ctx,
    TOOL_NAMES.feedback,
    requestArgs,
    toolOk(
      { suggestion: sent.value.id, status: "pending", reviewer: sent.value.publisher },
      sent.value.duplicate
        ? `The same summary for ${e.name} is already waiting for ${sent.value.publisher} to review. Nothing else to do.`
        : `Sent to ${sent.value.publisher}, who publishes ${ref}, for review. The summary stays as it is until they accept it. Nothing else to do.`,
    ),
  );
}

// Checks from where Zeqqat runs (zeqqat.com: the open internet) whether an
// address loads, or whether a port on a Dokploy server's public IP is open
// (lib/reachability.ts). The answer an agent can't get from its own
// sandbox, and the only honest way to say "it's live".
export async function toolCheck(ctx: Ctx, args: { address?: string; instance?: string; port?: number }): Promise<ToolResult> {
  const requestArgs = { address: args.address ?? null, instance: args.instance ?? null, port: args.port ?? null };
  const vantage =
    edition() === "cloud"
      ? "Checked from zeqqat.com, on the open internet."
      : "Checked from this Zeqqat's own server. If Zeqqat runs on the server being checked, an open or live result may not reflect the rest of the internet.";

  if (args.address) {
    const r = await checkAddress(args.address);
    if (!r) {
      return logged(ctx, TOOL_NAMES.check, requestArgs, toolError("address must be a hostname or an http(s) URL on port 80 or 443, e.g. zeqqat.example.org."));
    }
    return logged(ctx, TOOL_NAMES.check, requestArgs, toolOk({ ...r, vantage }, `${r.address}: ${r.outcome}${r.status ? ` (HTTP ${r.status})` : ""}. ${r.detail} ${vantage}`));
  }

  if (args.port !== undefined) {
    const instances = await reachableInstances(ctx);
    const inst = instances.find((i) => i.alias === args.instance);
    if (!inst || inst.integrationSlug !== "dokploy") {
      return logged(ctx, TOOL_NAMES.check, requestArgs, toolError(`instance must be a Dokploy instance on this connection: ${instanceNames(instances.filter((i) => i.integrationSlug === "dokploy"))}.`));
    }
    if (!(CHECKABLE_PORTS as readonly number[]).includes(args.port)) {
      return logged(ctx, TOOL_NAMES.check, requestArgs, toolError(`port must be one of ${CHECKABLE_PORTS.join(", ")} (SSH, web, Dokploy's dashboard).`));
    }
    const ipRes = await runEndpoint(ctx, { endpointName: "server.publicIp", instanceAlias: inst.alias, inputs: {} });
    const ip = ipRes.ok && typeof ipRes.data === "string" ? ipRes.data.trim() : null;
    if (!ip) {
      return logged(ctx, TOOL_NAMES.check, requestArgs, toolError("Couldn't get the server's public IP from Dokploy (server.publicIp), so the port can't be checked."));
    }
    let outcome;
    try {
      outcome = await checkPort(ip, args.port);
    } catch {
      return logged(ctx, TOOL_NAMES.check, requestArgs, toolError(`Dokploy reports ${ip}, which isn't a public address, so it can't be checked from the internet.`));
    }
    const what = args.port === 22 ? "SSH" : args.port === 3000 ? "Dokploy's dashboard port" : `port ${args.port}`;
    return logged(
      ctx,
      TOOL_NAMES.check,
      requestArgs,
      toolOk(
        { instance: inst.alias, ip, port: args.port, outcome, vantage },
        `${what} on ${ip} (${inst.alias}) is ${outcome === "open" ? "open to the internet" : "closed or blocked from the internet"}. ${vantage}`,
      ),
    );
  }

  return logged(ctx, TOOL_NAMES.check, requestArgs, toolError("Pass either address (to see if it loads) or instance plus port (to see if a port is open)."));
}
