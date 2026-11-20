import { describe, expect, it } from "vitest";
import { placeOf, isReservedWorkspaceSlug } from "../../lib/paths";

describe("placeOf", () => {
  it("reads the account and workspace from the URL", () => {
    expect(placeOf("/gaita")).toEqual({ kind: "account", org: "gaita" });
    expect(placeOf("/gaita/members")).toEqual({ kind: "account", org: "gaita" });
    expect(placeOf("/gaita/dokploy-integrations/abc")).toEqual({ kind: "account", org: "gaita" });
    expect(placeOf("/gaita/default")).toEqual({ kind: "workspace", org: "gaita", ws: "default" });
    expect(placeOf("/acme_corp/eng-team/activity/abc")).toEqual({ kind: "workspace", org: "acme_corp", ws: "eng-team" });
  });
  it("leaves tool pages, MCP URLs and the app's own routes alone", () => {
    for (const p of ["/", "/gaita/dokploy.http.application_deploy", "/gaita/mcp/deployment/a39f", "/app", "/app/org", "/blog/x", "/docs/agents", "/account", "/releases", "/favicon.ico", "/signin"]) {
      expect(placeOf(p)).toBeNull();
    }
  });
  it("keeps workspaces off the account pages' names", () => {
    for (const s of ["members", "settings", "dokploy-integrations", "mcp", "workspaces"]) expect(isReservedWorkspaceSlug(s)).toBe(true);
    expect(isReservedWorkspaceSlug("marketing")).toBe(false);
  });
});
