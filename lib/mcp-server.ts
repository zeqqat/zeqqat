import type { McpContext } from "./mcp-auth";
import { buildContext, mayDelete, reachableInstances, type ZeqqatContext } from "./mcp-context";
import { rateLimit } from "./rate-limit";
import { normalizeReason, REASON_DESCRIPTION, REASON_MISSING, REASON_REQUIRED, resolveRequest } from "./requests";
import { builtinAction } from "./tool-names";
import {
  TOOL_NAMES,
  toolCheck,
  toolDescribe,
  toolDocs,
  toolFeedback,
  toolImport,
  toolPolicy,
  toolRun,
  toolSearch,
  toolSecret,
  toolWhoami,
} from "./mcp-tools";
import type { ToolResult } from "./executor";
import { APP_VERSION } from "./version";

// The MCP JSON-RPC handler behind every connection URL
// (/<org>/mcp/<name>/<id>). The route resolves who is calling (or answers
// 401) before handing over; this file never decides access.

// `version` is the Zeqqat release (package.json), not the protocol
// version, so a self-hoster's bug report says which release they run.
const SERVER_INFO = { name: "zeqqat", version: APP_VERSION };
const SUPPORTED_MODERN_VERSIONS = ["2026-07-28"];
const SUPPORTED_LEGACY_VERSIONS = ["2025-11-25"];

// Claude Code cuts server instructions (and each tool description) at
// 2,048 characters; stay under it.
const MAX_INSTRUCTIONS = 2000;

// Every description ends with this, because clients may defer tools and
// drop instructions: whichever tool the model loads first, it learns
// where the context is.
const CONTEXT_HINT = " If you haven't seen the Zeqqat context in this conversation, call zeqqat_whoami first.";

// On search, describe and run it is required (lib/requests.ts); on the
// others it is optional and only groups the call into the request.
const REASON = { type: "string", description: REASON_DESCRIPTION } as const;
const REASON_OPTIONAL = {
  type: "string",
  description:
    "Optional. The same one-line reason you used on this request's other calls, so this call shows with them.",
} as const;

// The context object's shape, declared in every tool's outputSchema.
const CONTEXT_SCHEMA = {
  type: "object",
  properties: {
    account: {
      type: "object",
      properties: {
        username: { type: "string" },
        type: { type: "string", enum: ["personal", "organization"] },
      },
      required: ["username", "type"],
    },
    workspace: { type: "string" },
    connection: { type: ["string", "null"] },
    integrations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          toolCount: { type: "integer" },
          categories: { type: "array", items: { type: "string" } },
          instances: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                policy: { type: ["string", "null"] },
                policySummary: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["name", "instances"],
      },
    },
    missing: { type: "string" },
    notice: { type: ["string", "null"] },
  },
  required: ["account", "workspace", "integrations"],
} as const;

// structuredContent is always { context, result }. Only true must-haves
// are required: a result that fails validation counts as a failed call.
function outputSchema(result: Record<string, unknown>) {
  return { type: "object", properties: { context: CONTEXT_SCHEMA, result }, required: ["context"] };
}

// zeqqat_run's annotations are the only ones that change per connection:
// destructiveHint is set in tools/list from what the connection may do
// (see runTool below). This is the safe default, before that is known.
const RUN_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

// Every tool has a title and readOnlyHint or destructiveHint, which
// Claude's Connectors Directory requires.
// Every name here must pass lib/tool-names.ts's rules;
// tests/regression/tools-list-names.test.ts checks what tools/list serves.
// Descriptions are front-loaded: the first sentence says when to use the
// tool, in case a client shows only the start.
export const TOOLS = [
  {
    name: TOOL_NAMES.search,
    title: "Search tools",
    annotations: { title: "Search tools", readOnlyHint: true, openWorldHint: false },
    description:
      "Find tools across every integration this connection reaches (deploys, logs, apps, projects...). Always search before deciding a task can't be done. Returns operationIds to pass to zeqqat_run, with the instances each may run on." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'e.g. "deploy", "logs", "stop"' },
        limit: { type: "integer", minimum: 1, maximum: 25 },
        reason: REASON,
      },
      required: ["query", "reason"],
    },
    outputSchema: outputSchema({ type: "object", properties: { matches: { type: "array" } }, required: ["matches"] }),
  },
  {
    name: TOOL_NAMES.describe,
    title: "Describe a tool",
    annotations: { title: "Describe a tool", readOnlyHint: true, openWorldHint: false },
    description:
      "Inputs, outputs and permissions of one tool found with zeqqat_search. Pass its operationId, plus an instance if two integrations share the name." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "operationId from zeqqat_search, e.g. application.deploy" },
        instance: { type: "string", description: "Optional instance name from the context" },
        reason: REASON,
      },
      required: ["name", "reason"],
    },
    outputSchema: outputSchema({ type: "object" }),
  },
  {
    name: TOOL_NAMES.run,
    title: "Run a tool",
    annotations: { title: "Run a tool", ...RUN_ANNOTATIONS },
    description:
      "Run one tool on one instance. name is the operationId from zeqqat_search, instance is an instance name from the context, inputs match the tool's input schema (see zeqqat_describe)." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "operationId from zeqqat_search, e.g. application.deploy" },
        instance: { type: "string", description: "Instance name from the context, e.g. prod" },
        inputs: {
          type: "object",
          description:
            "The tool's inputs, matching its input schema. Secret values go in as handles ({{zq_secret_...}} from a result or zeqqat_secret), never typed out",
        },
        reason: REASON,
      },
      required: ["name", "instance", "reason"],
    },
    // Whatever the upstream endpoint returns.
    outputSchema: outputSchema({}),
  },
  {
    name: TOOL_NAMES.whoami,
    title: "Show context",
    annotations: { title: "Show context", readOnlyHint: true, openWorldHint: false },
    description:
      "Call first: returns the Zeqqat context. Which integrations and instances this connection reaches, and what you may do on each.",
    inputSchema: { type: "object", properties: { reason: REASON_OPTIONAL } },
    outputSchema: outputSchema({}),
  },
  {
    name: TOOL_NAMES.policy,
    title: "Show permissions",
    annotations: { title: "Show permissions", readOnlyHint: true, openWorldHint: false },
    description:
      "What you may do on each instance: the policy attached to it (its full allow list of tools) or the kinds allowed. Use it before telling the user something can't be done." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Optional instance name from the context" },
        reason: REASON_OPTIONAL,
      },
    },
    outputSchema: outputSchema({ type: "object", properties: { policies: { type: "array" } }, required: ["policies"] }),
  },
  {
    name: TOOL_NAMES.secret,
    title: "Create a secret",
    annotations: {
      title: "Create a secret",
      ...{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    description:
      "Create a random secret (a database password, a signing key) without ever seeing it. Returns a handle like {{zq_secret_...}} to put in zeqqat_run inputs, where Zeqqat fills in the value. Use it whenever a task needs a new password or key." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["password", "base64", "hex"],
          description:
            "password: letters and digits, length in characters (default). base64 or hex: length in random bytes",
        },
        length: { type: "integer", minimum: 16, maximum: 128, description: "Default 32" },
        reason: REASON,
      },
      required: ["reason"],
    },
    outputSchema: outputSchema({ type: "object", properties: { handle: { type: "string" } }, required: ["handle"] }),
  },
  {
    name: TOOL_NAMES.import,
    title: "Import an app's API",
    annotations: {
      title: "Import an app's API",
      ...{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    description:
      "Add an app (an API) to this account from a link to its OpenAPI spec, JSON or YAML, plus optionally its docs. Zeqqat turns every endpoint into a tool under @<account>/<app>. Running it again with the same link updates the app. Workspace admins only." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        spec_url: {
          type: "string",
          description: "Link to the raw OpenAPI 3 spec file, e.g. https://example.com/openapi.json",
        },
        docs_url: { type: "string", description: "Optional link to the app's API docs" },
        name: { type: "string", description: "Optional display name; defaults to the spec's title" },
        reason: REASON,
      },
      required: ["spec_url", "reason"],
    },
    outputSchema: outputSchema({
      type: "object",
      properties: { integration: { type: "string" } },
      required: ["integration"],
    }),
  },
  {
    name: TOOL_NAMES.feedback,
    title: "Suggest a tool summary",
    annotations: {
      title: "Suggest a tool summary",
      ...{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    description:
      "Suggest a better one-line summary for a tool, after finishing the user's task, when its summary made it hard to find or pick: a search missed it, or you took a long way. The integration's publisher reviews it; nothing changes until they accept." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "operationId from zeqqat_search, e.g. deployment.queueList" },
        instance: { type: "string", description: "Optional instance name, if two integrations share the operationId" },
        summary: {
          type: "string",
          description:
            "The summary you would have wanted: one line of plain text, 10 to 120 characters, saying what the tool answers",
        },
        note: { type: "string", description: "Optional: what you searched for or tried first" },
        reason: REASON,
      },
      required: ["name", "summary", "reason"],
    },
    outputSchema: outputSchema({
      type: "object",
      properties: { suggestion: { type: "string" } },
      required: ["suggestion"],
    }),
  },
  {
    name: TOOL_NAMES.check,
    title: "Check an address",
    annotations: { title: "Check an address", readOnlyHint: true, openWorldHint: true },
    description:
      "Check from the internet (where Zeqqat runs, not from your sandbox) whether an address loads, or whether a port on a Dokploy server is open. Use it before telling a user something is live, and to explain why it isn't. address returns live, certificate_not_ready (retry in a minute), error_page (wired wrong), unreachable (the cloud firewall blocks it) or not_found. instance plus port (22, 80, 443 or 3000) says open or closed." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "A hostname or http(s) URL, e.g. zeqqat-abc-1-2-3-4.sslip.io" },
        instance: { type: "string", description: "With port: a Dokploy instance name from the context" },
        port: {
          type: "integer",
          enum: [22, 80, 443, 3000],
          description: "With instance: the port to check on that server's public IP",
        },
        reason: REASON_OPTIONAL,
      },
    },
    outputSchema: outputSchema({ type: "object" }),
  },
  {
    name: TOOL_NAMES.docs,
    title: "Read Zeqqat docs",
    annotations: { title: "Read Zeqqat docs", readOnlyHint: true, openWorldHint: false },
    description:
      "Answers questions about how Zeqqat works: why a call was denied, permissions, integrations, instances, connections, errors. Pass a question; returns short passages." +
      CONTEXT_HINT,
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: 'e.g. "why was my call denied"' },
        section: { type: "string", description: "Optional section id from a previous answer" },
        reason: REASON_OPTIONAL,
      },
    },
    outputSchema: outputSchema({ type: "object", properties: { passages: { type: "array" } }, required: ["passages"] }),
  },
];

function jsonRpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function jsonRpcResult(id: unknown, result: Record<string, unknown>) {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: { resultType: "complete", ...result, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } },
  });
}

// Pure: the server instructions from the context. Plain sentences first
// (some clients cut long text), then the context itself as JSON. A sunset
// notice goes first so it survives any truncation.
export function instructionsFrom(context: ZeqqatContext, callerRole: McpContext["callerRole"]): string {
  // Cutting the text mid-JSON would hand the model a broken context, so
  // when it doesn't fit, drop detail instead: first the per-instance
  // permissions, then the instance lists. zeqqat_whoami has it all.
  for (const candidate of [context, withoutPermissions(context), withoutInstances(context)]) {
    const text = instructionsText(candidate, callerRole);
    if (text.length <= MAX_INSTRUCTIONS) return text;
  }
  return instructionsText(withoutInstances(context), callerRole).slice(0, MAX_INSTRUCTIONS);
}

function withoutPermissions(context: ZeqqatContext): ZeqqatContext {
  return {
    ...context,
    integrations: context.integrations.map((g) => ({
      ...g,
      instances: g.instances.map((i) => ({ ...i, policySummary: "See zeqqat_whoami or zeqqat_policy." })),
    })),
  };
}

function withoutInstances(context: ZeqqatContext): ZeqqatContext {
  return {
    ...context,
    integrations: context.integrations.map((g) => ({
      ...g,
      title: `${g.title} (${g.instances.length} instances, call zeqqat_whoami for the list)`,
      instances: [],
    })),
  };
}

function instructionsText(context: ZeqqatContext, callerRole: McpContext["callerRole"]): string {
  const reach = context.integrations.length
    ? context.integrations
        .map(
          (g) =>
            `${g.name}, ${g.toolCount} tools (${g.instances.map((i) => i.name).join(", ") || "instances listed by zeqqat_whoami"})`,
        )
        .join("; ")
    : "nothing yet";
  const who = callerRole === "public" ? " Public connection: read only." : "";
  const text =
    `${context.notice ? `${context.notice} ` : ""}Zeqqat MCP gateway. Connection "${context.connection ?? ""}" in workspace "${context.workspace}", owned by the ${context.account.type} account @${context.account.username}. Reaches: ${reach}.${who} ` +
    `Flow: zeqqat_search, then zeqqat_describe, then zeqqat_run with an operationId and an instance name. Search, describe and run need a one-line reason saying what the user asked for, worded the same on every call for one request. Every result starts with this context. Secrets never reach you: results show handles like {{zq_secret_...}}, which you pass back in zeqqat_run inputs, and zeqqat_secret creates new ones. ` +
    `Context: ${JSON.stringify({ context })}`;
  return text;
}

async function buildInstructions(ctx: McpContext): Promise<string> {
  return instructionsFrom(await buildContext(ctx), ctx.callerRole);
}

// Pure: one tool's result as an MCP result (project doc
// mcp-context-and-policy-v1, section 2). Clients differ on what reaches
// the model (Claude Code shows structuredContent on success and content on
// errors; others show content), so the context is in both. Errors carry
// no structuredContent: Cursor validates even error results against the
// success schema, and Claude Code drops it on errors anyway.
export function shapeResult(context: ZeqqatContext, result: ToolResult) {
  const content = [
    { type: "text", text: JSON.stringify({ context }) },
    { type: "text", text: result.text },
    ...(context.notice ? [{ type: "text", text: context.notice }] : []),
  ];
  if (!result.ok) return { content, isError: true };
  return { content, structuredContent: { context, result: result.data ?? null } };
}

async function handleToolsCall(base: McpContext, id: unknown, params: any) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  // The reason groups calls into requests on the Activity page. Search,
  // describe and run refuse to run without one; nothing is logged, since
  // nothing happened, and the agent calls again with it set.
  const action = typeof name === "string" ? builtinAction(name) : null;
  const reason = normalizeReason(args.reason);
  if (!reason && action && REASON_REQUIRED.has(action)) {
    return jsonRpcResult(id, shapeResult(await buildContext(base), { ok: false, text: REASON_MISSING }));
  }
  const known = (Object.values(TOOL_NAMES) as string[]).includes(name);
  const requestId =
    reason && known
      ? await resolveRequest({
          userId: base.userId,
          oauthClientId: base.oauthClientId,
          connectionId: base.connectionId,
          reason,
        })
      : null;
  const ctx: McpContext = { ...base, reason, requestId };

  let result: ToolResult;
  switch (name) {
    case TOOL_NAMES.search:
      result = await toolSearch(ctx, args);
      break;
    case TOOL_NAMES.describe:
      result = await toolDescribe(ctx, args);
      break;
    case TOOL_NAMES.run:
      result = await toolRun(ctx, args);
      break;
    case TOOL_NAMES.whoami:
      result = await toolWhoami(ctx);
      break;
    case TOOL_NAMES.docs:
      result = await toolDocs(ctx, args);
      break;
    case TOOL_NAMES.policy:
      result = await toolPolicy(ctx, args);
      break;
    case TOOL_NAMES.secret:
      result = await toolSecret(ctx, args);
      break;
    case TOOL_NAMES.feedback:
      result = await toolFeedback(ctx, args);
      break;
    case TOOL_NAMES.import:
      result = await toolImport(ctx, args);
      break;
    case TOOL_NAMES.check:
      result = await toolCheck(ctx, args);
      break;
    default:
      // Unknown tool: the caller invoked something that doesn't exist —
      // that's "you called me wrong" (spec section 8), a JSON-RPC error,
      // not a tool result.
      return jsonRpcError(id, -32602, `Unknown tool "${name}"`);
  }

  // Built after the tool ran, so it reflects the state the call saw.
  // whoami always gets the full list, never the shortened one.
  const context = await buildContext(ctx, { full: name === TOOL_NAMES.whoami });
  return jsonRpcResult(id, shapeResult(context, result));
}

// Same body and headers for every connection path, whether it exists or
// not (naming doc v2, section 8), so probing reveals nothing.
export function unauthorized(resourceMetadataUrl: string) {
  // Has to be a real 401 with WWW-Authenticate, not a 200 wrapping a
  // JSON-RPC error: that header is what makes an MCP client show "sign in
  // required" and start OAuth at all.
  return Response.json(
    { error: "invalid_token", error_description: "Authentication required" },
    {
      status: 401,
      headers: { "www-authenticate": `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"` },
    },
  );
}

// After a connection's cutoff (naming doc v2, section 6): connecting still
// works, so the model can explain, but no tools are listed and any call
// gets the message. No sign-in needed, there is nothing left to protect.
export async function serveSunset(request: Request, message: string) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }
  const id = body?.id;
  if (id === undefined) return new Response(null, { status: 204 });
  if (body?.method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: SUPPORTED_LEGACY_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: message.slice(0, 500),
      },
    });
  }
  if (body?.method === "tools/list") return jsonRpcResult(id, { tools: [], ttlMs: 60_000, cacheScope: "private" });
  if (body?.method === "tools/call") {
    return jsonRpcResult(id, { content: [{ type: "text", text: message }], isError: true });
  }
  return jsonRpcError(id, -32601, message);
}

export async function serveMcp(request: Request, ctx: McpContext, rateKey: string) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }

  const method: string | undefined = body?.method;
  const id = body?.id;
  const isNotification = id === undefined;

  switch (method) {
    case "initialize": {
      // Legacy handshake (2025-11-25 and earlier), still answered for
      // dual-era compatibility.
      const requested = body?.params?.protocolVersion;
      const version = SUPPORTED_LEGACY_VERSIONS.includes(requested) ? requested : SUPPORTED_LEGACY_VERSIONS[0];
      return Response.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: await buildInstructions(ctx),
        },
      });
    }

    case "notifications/initialized":
      return new Response(null, { status: 204 });

    case "server/discover":
      // Clients that get an answer here may never send initialize, so the
      // instructions have to be here too.
      return jsonRpcResult(id, {
        supportedVersions: SUPPORTED_MODERN_VERSIONS,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: await buildInstructions(ctx),
      });

    case "tools/list": {
      // zeqqat_run is labeled destructive only where this connection can
      // delete something for this caller.
      const destructive = await mayDelete(await reachableInstances(ctx));
      const tools = TOOLS.map((t) =>
        t.name === TOOL_NAMES.run ? { ...t, annotations: { ...t.annotations, destructiveHint: destructive } } : t,
      );
      return jsonRpcResult(id, {
        tools,
        // Tenant-specific catalog, never cached publicly.
        ttlMs: 60_000,
        cacheScope: "private",
      });
    }

    case "tools/call": {
      if (isNotification) return new Response(null, { status: 204 });
      // tools/call is the only method that reaches an external API.
      if (!(await rateLimit(rateKey, 120, 60_000))) {
        return jsonRpcError(id, -32003, "Rate limit exceeded, retry shortly", 429);
      }
      return handleToolsCall(ctx, id, body?.params);
    }

    default:
      if (isNotification) return new Response(null, { status: 204 });
      return jsonRpcError(id, -32601, `Unknown method "${method}"`);
  }
}
