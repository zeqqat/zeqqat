import { describe, expect, it } from "vitest";
import {
  builtinAction,
  builtinToolName,
  compileEndpointName,
  isBuiltinToolName,
  isValidSegment,
  parsePolicyDotted,
  policyPagePath,
  toPolicyCanonical,
  toPolicyName,
  MAX_BUILTIN_NAME_LENGTH,
  parseDotted,
  parseToolRef,
  toolPagePath,
  sanitizeOperationId,
  toCanonical,
  type ToolNameParts,
} from "../../lib/tool-names";

const base: ToolNameParts = { org: "zeqqat", target: "zeqqat", type: "http", action: "search" };
describe("isValidSegment", () => {
  it.each(["search", "list_repos", "v2"])("accepts %s", (s) => {
    expect(isValidSegment(s)).toBe(true);
  });

  it.each([
    ["uppercase", "Search"],
    ["leading underscore", "_search"],
    ["trailing underscore", "search_"],
    ["doubled underscore", "list__repos"],
    ["hyphen", "list-repos"],
    ["dot", "list.repos"],
    ["space", "list repos"],
    ["empty string", ""],
    ["@ and /", "@zeqqat/zeqqat"],
  ])("rejects %s", (_label, s) => {
    expect(isValidSegment(s)).toBe(false);
  });
});

describe("builtinToolName", () => {
  it.each(["search", "describe", "run", "whoami", "docs"])("builds zeqqat_%s", (action) => {
    expect(builtinToolName(action)).toBe(`zeqqat_${action}`);
  });

  it.each([
    ["uppercase", "Search"],
    ["hyphen", "list-repos"],
    ["dot", "list.repos"],
    ["doubled underscore", "list__repos"],
    ["too long", "a_very_long_built_in_tool_name_here"],
  ])("rejects %s", (_label, action) => {
    expect(() => builtinToolName(action)).toThrow();
  });

  it("stays inside Claude's client name check with a long connector name", () => {
    const composed = `mcp__${"a".repeat(20)}__${builtinToolName("describe")}`;
    expect(composed).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(builtinToolName("describe").length).toBeLessThanOrEqual(MAX_BUILTIN_NAME_LENGTH);
  });
});

describe("isBuiltinToolName / builtinAction", () => {
  it("recognises the zeqqat_ names", () => {
    expect(isBuiltinToolName("zeqqat_run")).toBe(true);
    expect(builtinAction("zeqqat_run")).toBe("run");
  });
  it("reads the legacy names in old call logs", () => {
    expect(builtinAction("zeqqat-zeqqat-http-search-v1")).toBe("search");
  });
  it("returns null for a catalog name", () => {
    expect(builtinAction("@zeqqat/dokploy.http.application_deploy")).toBeNull();
    expect(isBuiltinToolName("application.deploy")).toBe(false);
  });
});

describe("toCanonical", () => {
  it("matches the spec's example", () => {
    expect(toCanonical(base)).toBe("@zeqqat/zeqqat.http.search");
  });
});

describe("sanitizeOperationId", () => {
  it.each([
    ["issues/list-for-repo", "issues_list_for_repo"],
    ["Campaigns.List", "campaigns_list"],
    ["listAccounts_v2", "list_accounts_v2"],
  ])("sanitizes %s", (raw, expected) => {
    expect(sanitizeOperationId(raw)).toBe(expected);
  });

  it("derives from method+path when operationId is missing", () => {
    expect(sanitizeOperationId(undefined, "get", "/v1/charges")).toBe("get_v1_charges");
  });

  it("derives from method+path with placeholders", () => {
    expect(sanitizeOperationId(undefined, "get", "/repos/{owner}/{repo}/issues")).toBe("get_repos_owner_repo_issues");
  });

  it("falls back to method+path when operationId sanitizes to nothing", () => {
    expect(sanitizeOperationId("!!!", "get", "/v1/charges")).toBe("get_v1_charges");
  });
});

describe("naming examples", () => {
  it("compiles the HTTP tool example", () => {
    expect(toCanonical({ org: "gaita", target: "dokploy", type: "http", action: "application_deploy" })).toBe(
      "@gaita/dokploy.http.application_deploy",
    );
  });

  it("builds the tool page path without the @", () => {
    expect(toolPagePath({ org: "gaita", target: "dokploy", type: "http", action: "application_deploy" })).toBe(
      "/gaita/dokploy.http.application_deploy",
    );
  });
});

describe("parseDotted", () => {
  it("parses a tool page segment", () => {
    expect(parseDotted("dokploy.http.application_deploy")).toEqual({ target: "dokploy", type: "http", action: "application_deploy", pin: null });
  });
  it("splits off a version pin", () => {
    expect(parseDotted("dokploy.http.application_deploy@1.4.0")?.pin).toBe("1.4.0");
  });
  it.each(["mcp", "c", "dokploy.core.x", "dokploy.http", "Dokploy.http.x"])("rejects %s", (s) => {
    expect(parseDotted(s)).toBeNull();
  });
});

describe("parseToolRef", () => {
  const expected = { target: "dokploy", type: "http", action: "application_deploy" };
  it("does not read the retired wire form", () => {
    expect(parseToolRef("gaita-dokploy-http-application_deploy-v1")).toBeNull();
  });
  it("reads the canonical form", () => {
    expect(parseToolRef("@gaita/dokploy.http.application_deploy")).toEqual({ ...expected, org: "gaita" });
  });
  it("reads the dotted form", () => {
    expect(parseToolRef("dokploy.http.application_deploy")).toEqual({ ...expected, org: null });
  });
  it("returns null for a raw operationId", () => {
    expect(parseToolRef("application.deploy")).toBeNull();
  });
});

describe("compileEndpointName", () => {
  it("compiles a Dokploy operationId", () => {
    expect(compileEndpointName({ orgSlug: "zeqqat", integrationSlug: "dokploy", operationId: "application.deploy" })).toEqual({
      action: "application_deploy",
      major: 1,
      canonical: "@zeqqat/dokploy.http.application_deploy",
    });
  });

  it("never shortens or hashes a long name, whatever the org", () => {
    const r = compileEndpointName({
      orgSlug: "perminus_gaita",
      integrationSlug: "dokploy",
      operationId: "notification.testDiscordConnection",
    });
    expect(r.action).toBe("notification_test_discord_connection");
    expect(r.canonical).toBe("@perminus_gaita/dokploy.http.notification_test_discord_connection");
  });
});

describe("policy names", () => {
  it("follows the tool scheme with type policy", () => {
    expect(toPolicyCanonical("gaita", "dokploy", "read_plus_deploy")).toBe("@gaita/dokploy.policy.read_plus_deploy");
    expect(policyPagePath("gaita", "dokploy", "read_plus_deploy")).toBe("/gaita/dokploy.policy.read_plus_deploy");
  });
  it("parses a policy page segment and nothing else", () => {
    expect(parsePolicyDotted("dokploy.policy.read_plus_deploy")).toEqual({ integrationSlug: "dokploy", name: "read_plus_deploy" });
    expect(parsePolicyDotted("dokploy.http.application_deploy")).toBeNull();
  });
  it("normalizes a typed name", () => {
    expect(toPolicyName("Read + Deploy")).toBe("read_deploy");
  });
});
