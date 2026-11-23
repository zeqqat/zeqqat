import { describe, expect, it, vi } from "vitest";
import { isBuiltinToolName, MAX_BUILTIN_NAME_LENGTH } from "../../lib/tool-names";

// Claude's web and desktop clients silently drop any tool whose name falls
// outside this pattern: the connector shows as connected with zero tools.
// This calls the real tools/list handler, so a name added anywhere on that
// path, not just in the TOOLS array, is caught.
const CLAUDE_CLIENT_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

vi.mock("../../lib/env", () => ({ publicUrl: () => "http://localhost" }));

vi.mock("../../lib/connections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/connections")>()),
  findConnectionByPath: async () => ({
    id: "conn",
    organizationId: "org",
    workspaceId: "ws",
    name: "deployment",
    shortId: "a39f",
    authMode: "members",
    sunsetAt: null,
    replacedByConnectionId: null,
    orgSlug: "test",
  }),
  sunsetNotice: async () => ({ state: "live", text: "", replacementUrl: null }),
}));

// No database here: the connection reaches nothing, so no run tool is
// listed.
vi.mock("../../lib/mcp-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mcp-context")>()),
  reachableInstances: async () => [],
}));

vi.mock("../../lib/mcp-auth", () => ({
  accountType: (kind: string) => (kind === "personal" ? "personal" : "organization"),
  resolveBearerToken: async () => ({
    organizationId: "org",
    workspaceId: "ws",
    organizationSlug: "test",
    organizationKind: "organization",
    workspaceName: "Test",
    oauthClientId: "client",
    userId: "user",
    connectionId: "conn",
    callerRole: "admin",
  }),
}));

type ListedTool = { name: string; title?: string; annotations?: Record<string, unknown> };

async function listTools(): Promise<ListedTool[]> {
  const { POST } = await import("../../app/mcp-internal/[org]/[name]/[id]/route");
  const response = await POST(
    new Request("http://localhost/mcp-internal/test/deployment/a39f", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    { params: Promise.resolve({ org: "test", name: "deployment", id: "a39f" }) },
  );
  const body = await response.json();
  return body.result.tools;
}

describe("tools/list names", async () => {
  const tools = await listTools();
  const names = tools.map((t) => t.name);

  it("returns at least one tool", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)("%s is accepted by Claude's clients and is a zeqqat_ built-in", (name) => {
    // The client checks mcp__<connector>__<name>; leave room for a
    // 20-character connector name.
    expect(`mcp__${"c".repeat(20)}__${name}`).toMatch(CLAUDE_CLIENT_NAME);
    expect(name.length).toBeLessThanOrEqual(MAX_BUILTIN_NAME_LENGTH);
    expect(isBuiltinToolName(name)).toBe(true);
  });
});

// Claude's Connectors Directory requires a title and readOnlyHint or
// destructiveHint on every tool.
describe("tools/list annotations", async () => {
  const tools = await listTools();

  it.each(tools.map((t) => [t.name, t] as const))("%s has a title and a read-only or destructive hint", (_, tool) => {
    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.title).toBe(tool.title);
    const a = tool.annotations ?? {};
    expect(typeof a.readOnlyHint === "boolean" || typeof a.destructiveHint === "boolean").toBe(true);
  });

  it("lists no run tool when the MCP URL allows nothing", () => {
    expect(tools.filter((t) => ["zeqqat_read", "zeqqat_create", "zeqqat_edit", "zeqqat_delete"].includes(t.name))).toEqual([]);
  });

  it("gives each run tool annotations true to its kind", async () => {
    const { TOOLS } = await import("../../lib/mcp-server");
    const byName: Record<string, unknown> = Object.fromEntries(TOOLS.map((t) => [t.name, t.annotations]));
    expect(byName.zeqqat_read).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.zeqqat_create).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.zeqqat_edit).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.zeqqat_delete).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.zeqqat_run).toBeUndefined();
  });
});
