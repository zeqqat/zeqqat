import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/env", () => ({ publicUrl: () => "http://localhost" }));

import {
  callState,
  durationText,
  lookupText,
  policyShortName,
  relativeTime,
  splitCanonical,
  stripMode,
  tallyParts,
} from "../../lib/activity-format";
import { buildCard, type ActivityCall } from "../../lib/activity";
import { normalizeReason, REASON_REQUIRED } from "../../lib/requests";
import { describeOutbound } from "../../lib/executor";
import { TOOLS } from "../../lib/mcp-server";
import { builtinAction } from "../../lib/tool-names";

const now = new Date("2026-11-01T11:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("relativeTime", () => {
  it("reads like Twitter", () => {
    expect(relativeTime(ago(3_000), now, "UTC")).toBe("now");
    expect(relativeTime(ago(40_000), now, "UTC")).toBe("40s");
    expect(relativeTime(ago(18 * 60_000), now, "UTC")).toBe("18m");
    expect(relativeTime(ago(5 * 3_600_000), now, "UTC")).toBe("5h");
    expect(relativeTime(new Date("2026-10-28T10:00:00Z"), now, "UTC")).toBe("Oct 28");
    expect(relativeTime(new Date("2025-03-03T10:00:00Z"), now, "UTC")).toBe("Mar 3, 2025");
  });
});

describe("the strip", () => {
  it("is dots up to 12 calls, ticks up to 40, then a bar", () => {
    expect(stripMode(1)).toBe("dots");
    expect(stripMode(12)).toBe("dots");
    expect(stripMode(13)).toBe("ticks");
    expect(stripMode(40)).toBe("ticks");
    expect(stripMode(41)).toBe("bar");
  });

  it("counts only what isn't plain done", () => {
    expect(tallyParts(["ok", "ok"])).toEqual({ total: "2 calls", extra: [] });
    const t = tallyParts(["ok", "blocked", "error", "running"]);
    expect(t.total).toBe("4 calls");
    expect(t.extra.map((e) => e.text)).toEqual(["1 running", "1 failed", "1 blocked"]);
  });
});

describe("small formatters", () => {
  it("maps outcomes to states", () => {
    expect(callState("ok")).toBe("ok");
    expect(callState("running")).toBe("running");
    expect(callState("blocked")).toBe("blocked");
    expect(callState("weird")).toBe("error");
  });
  it("splits a canonical name and shortens a policy name", () => {
    expect(splitCanonical("@zeqqat/dokploy.http.application_one")).toEqual(["@zeqqat/", "dokploy.http.application_one"]);
    expect(splitCanonical("application.one")).toEqual(["", "application.one"]);
    expect(policyShortName("@gaita/dokploy.policy.read_plus_deploy")).toBe("read_plus_deploy");
    expect(policyShortName(null)).toBeNull();
  });
  it("writes durations and lookup lines", () => {
    expect(durationText(602)).toBe("602ms");
    expect(durationText(22_000)).toBe("22s");
    expect(durationText(6_600)).toBe("6.6s");
    expect(lookupText("search", { query: "deploy" })).toBe("Looked up “deploy” in the catalog");
    expect(lookupText("describe", { name: "application.one" })).toBe("Read how application.one works");
  });
});

describe("the reason", () => {
  it("is required on search, describe, run, secret, import and feedback, in their schemas too", () => {
    expect([...REASON_REQUIRED].sort()).toEqual(["describe", "feedback", "import", "run", "search", "secret"]);
    for (const tool of TOOLS) {
      const action = builtinAction(tool.name)!;
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect((tool.inputSchema as { properties: Record<string, unknown> }).properties.reason).toBeDefined();
      expect(required.includes("reason")).toBe(REASON_REQUIRED.has(action));
    }
  });

  it("is trimmed, single-spaced, capped, and scrubbed", () => {
    expect(normalizeReason("  Redeploy   My App \n now ")).toBe("Redeploy My App now");
    expect(normalizeReason("   ")).toBeNull();
    expect(normalizeReason(42)).toBeNull();
    expect(normalizeReason("x".repeat(500))!.length).toBe(300);
    const scrubbed = normalizeReason("deploy with ghp_abcdefghijklmnopqrstuvwxyz0123456789AB")!;
    expect(scrubbed).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789AB");
  });
});

describe("the outbound request", () => {
  it("names the credential header but never stores its value", () => {
    const url = new URL("https://dokploy.example.net/api/application.one?applicationId=kq3");
    const out = describeOutbound("GET", url, undefined, "x-api-key");
    expect(out).toEqual({
      method: "GET",
      url: "https://dokploy.example.net/api/application.one",
      query: { applicationId: "kq3" },
      headers: { "x-api-key": "[redacted by zeqqat]", "content-type": "application/json" },
    });
    const post = describeOutbound("POST", new URL("https://d.example.net/api/application.stop"), '{"applicationId":"kq3"}', "x-api-key");
    expect(post.body).toEqual({ applicationId: "kq3" });
    expect(post.query).toBeUndefined();
  });
});

function call(over: Partial<ActivityCall>): ActivityCall {
  return {
    id: "c1",
    requestId: "r1",
    at: "2026-11-01T10:44:50.000Z",
    state: "ok",
    httpStatus: 200,
    durationMs: 100,
    lookup: null,
    lookupTool: null,
    toolName: "@zeqqat/dokploy.http.application_one",
    op: "application.one",
    summary: "Get one application",
    kind: "read",
    method: "GET",
    path: "/api/application.one",
    integrationRef: "@zeqqat/dokploy",
    integrationSlug: "dokploy",
    instanceId: "i1",
    instanceAlias: "dokploy-production",
    instanceBaseUrl: "https://d.example.net",
    connectionId: "k1",
    connectionName: "deployment",
    connectionUrl: "http://localhost/gaita/mcp/deployment/a39f",
    workspaceName: "Default",
    account: { username: "gaita", type: "personal" },
    inputs: {},
    response: {},
    outbound: null,
    errorMessage: null,
    redactions: 0,
    policyName: null,
    policyVersion: null,
    callerRole: "admin",
    specRelease: null,
    reason: "Fix the 502s",
    person: { name: "Perminus Gaita", username: "gaita", image: null },
    agent: { host: "claude.ai" },
    ...over,
  };
}

describe("a request card", () => {
  it("counts app calls, not lookups, and says why it stopped", () => {
    const card = buildCard("r1", "Fix the 502s", [
      call({ id: "a", lookup: "Looked up “logs” in the catalog", toolName: "zeqqat_search" }),
      call({ id: "b" }),
      call({ id: "c", state: "blocked", op: "application.stop", policyName: "@gaita/dokploy.policy.read_plus_deploy", connectionId: "k1" }),
    ]);
    expect(card.states).toEqual(["ok", "blocked"]);
    expect(card.lookups).toBe(1);
    expect(card.note).toEqual({ tone: "blocked", text: "Stopped: application.stop is not on the read_plus_deploy policy." });
    expect(card.blocked).toEqual({ op: "application.stop", instanceAlias: "dokploy-production", connectionId: "k1" });
    expect(card.instances).toEqual([{ id: "i1", alias: "dokploy-production" }]);
    expect(card.connections).toEqual([{ id: "k1", name: "deployment" }]);
    expect(card.href).toBe("/app/activity/r1");
  });

  it("names the instance that failed", () => {
    const card = buildCard("r2", "Check staging", [call({ state: "error", httpStatus: 401, instanceAlias: "dokploy-staging" })]);
    expect(card.note).toEqual({ tone: "error", text: "dokploy-staging answered 401." });
  });
});

describe("overview tile filters", () => {
  it("reads only the filters the tiles use", async () => {
    const { parseActivityFilter, activityFilterLabel } = await import("../../lib/activity-format");
    expect(parseActivityFilter({ when: "today", show: "blocked" })).toEqual({ today: true, show: "blocked" });
    expect(parseActivityFilter({ when: "yesterday", show: "everything" })).toEqual({ today: false, show: null });
    expect(activityFilterLabel({ today: true, show: null })).toBe("Calls today");
    expect(activityFilterLabel({ today: true, show: "redacted" })).toBe("Calls with secrets redacted today");
    expect(activityFilterLabel({ today: false, show: null })).toBeNull();
  });
});
