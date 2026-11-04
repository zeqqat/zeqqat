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

async function listToolNames(): Promise<string[]> {
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
  return body.result.tools.map((t: { name: string }) => t.name);
}

describe("tools/list names", async () => {
  const names = await listToolNames();

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
