import { describe, expect, it } from "vitest";
import { connectionRoute, internalMcpPath, parseConnectionPath } from "../../lib/connection-paths";

// Naming doc v2, sections 6 and 8.
describe("parseConnectionPath", () => {
  it("parses the doc's example", () => {
    expect(parseConnectionPath("/acme_corp/mcp/deployment/a39f")).toEqual({ org: "acme_corp", name: "deployment", shortId: "a39f" });
  });

  it("allows a trailing slash", () => {
    expect(parseConnectionPath("/acme_corp/mcp/deployment/a39f/")).not.toBeNull();
  });

  it.each([
    ["the old /c/ shape", "/c/acme_corp/deployment/a39f"],
    ["a hyphenated org", "/acme-corp/mcp/deployment/a39f"],
    ["an uppercase name", "/acme_corp/mcp/Deployment/a39f"],
    ["a missing short id", "/acme_corp/mcp/deployment"],
    ["an extra segment", "/acme_corp/mcp/deployment/a39f/x"],
    ["a collection URL", "/gaita/c/postgres_safety"],
    ["a tool page", "/gaita/dokploy.http.application_deploy"],
    ["the org page", "/gaita"],
  ])("rejects %s", (_label, path) => {
    expect(parseConnectionPath(path)).toBeNull();
  });
});

describe("connectionRoute", () => {
  it.each<[string, string | null, ReturnType<typeof connectionRoute>]>([
    ["POST", "application/json, text/event-stream", "mcp"],
    ["POST", null, "mcp"],
    ["GET", "text/event-stream", "method_not_allowed"],
    ["GET", "text/html,application/xhtml+xml,*/*;q=0.8", "page"],
    ["GET", "text/html, text/event-stream", "method_not_allowed"],
    ["GET", "*/*", "method_not_allowed"],
    ["GET", null, "method_not_allowed"],
    ["GET", "application/json", "method_not_allowed"],
    ["HEAD", "text/html", "page"],
    ["DELETE", "text/html", "method_not_allowed"],
    ["PUT", null, "method_not_allowed"],
  ])("%s with Accept %s -> %s", (method, accept, expected) => {
    expect(connectionRoute(method, accept)).toBe(expected);
  });
});

describe("internalMcpPath", () => {
  it("uses a prefix no org slug can have", () => {
    expect(internalMcpPath({ org: "acme_corp", name: "deployment", shortId: "a39f" })).toBe("/mcp-internal/acme_corp/deployment/a39f");
  });
});
