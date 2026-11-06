import { publicUrl } from "../../../../lib/env";
import { checkOperatorKey, daily, installs, latestUsers, summary, versions } from "../../../../lib/operator";
import { APP_VERSION } from "../../../../lib/version";

// The operator stats API (lib/operator.ts). /api/operator/openapi.json is
// public (it describes the API, no data) so Zeqqat can import it; the rest
// needs ZEQQAT_OPERATOR_KEY as a Bearer token. With no key set, it's all 404.

function clamp(raw: string | null, min: number, max: number, fallback: number) {
  const v = Number(raw);
  return Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = checkOperatorKey(request);
  if (auth === null) return new Response(null, { status: 404 });

  if (name === "openapi.json") return json(spec());
  if (!auth) return json({ error: "Send the operator key as a Bearer token." }, 401);

  const q = new URL(request.url).searchParams;
  switch (name) {
    case "summary":
      return json(await summary());
    case "daily":
      return json({ rows: await daily(clamp(q.get("days"), 1, 365, 30)) });
    case "users":
      return json({ rows: await latestUsers(clamp(q.get("limit"), 1, 100, 25)) });
    case "installs":
      return json({ rows: await installs(clamp(q.get("limit"), 1, 100, 25)) });
    case "versions":
      return json({ rows: await versions() });
    default:
      return new Response(null, { status: 404 });
  }
}

function rowsOf(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties: { rows: { type: "array", items: { type: "object", properties } } },
  };
}

function op(operationId: string, summaryText: string, schema: unknown, parameters: unknown[] = []) {
  return {
    get: {
      operationId,
      summary: summaryText,
      parameters,
      responses: { "200": { description: "OK", content: { "application/json": { schema } } } },
    },
  };
}

const intParam = (name: string, description: string, max: number) => ({
  name,
  in: "query",
  required: false,
  description,
  schema: { type: "integer", minimum: 1, maximum: max },
});

function spec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Zeqqat Operator",
      version: APP_VERSION,
      description: "Read-only numbers for the operator of this Zeqqat install: sign-ups, usage and self-hosted installs.",
    },
    servers: [{ url: `${publicUrl()}/api/operator` }],
    security: [{ operatorKey: [] }],
    components: { securitySchemes: { operatorKey: { type: "http", scheme: "bearer" } } },
    paths: {
      "/summary": op("summary", "Headline counts: users, new users, agent requests, tool calls and installs", {
        type: "object",
        properties: Object.fromEntries(
          ["usersTotal", "usersNew7d", "usersNew30d", "agentRequests7d", "toolCalls7d", "toolCallsTotal", "installsSeen", "installsActive7d", "installsNew7d"].map(
            (k) => [k, { type: "integer" }],
          ),
        ),
      }),
      "/daily": op(
        "daily",
        "Sign-ups, tool calls and new installs per day, oldest first",
        rowsOf({ day: { type: "string" }, signups: { type: "integer" }, tool_calls: { type: "integer" }, new_installs: { type: "integer" } }),
        [intParam("days", "How many days back, default 30", 365)],
      ),
      "/users": op(
        "latest_users",
        "The latest sign-ups with how they signed in, newest first",
        rowsOf({ name: { type: "string" }, email: { type: "string" }, providers: { type: "string" }, joinedAt: { type: "string" } }),
        [intParam("limit", "How many, default 25", 100)],
      ),
      "/installs": op(
        "installs",
        "Self-hosted installs that pinged, most recent first",
        rowsOf({ install: { type: "string" }, version: { type: "string" }, firstSeenAt: { type: "string" }, lastSeenAt: { type: "string" }, pings: { type: "integer" }, active: { type: "boolean" } }),
        [intParam("limit", "How many, default 25", 100)],
      ),
      "/versions": op("versions", "Versions active self-hosted installs run, with how many run each", rowsOf({ version: { type: "string" }, installs: { type: "integer" } })),
    },
  };
}
