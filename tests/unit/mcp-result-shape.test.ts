import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/env", () => ({ publicUrl: () => "http://localhost" }));

import { contextFrom, sortedCategories, type CatalogStats, type ReachableInstance, FULL_CONTEXT_MAX_INSTANCES } from "../../lib/mcp-context";
import { accessSummary, toolAllowed, type InstanceAccess } from "../../lib/policies";
import { ROLE_CAP } from "../../lib/connections";
import { instructionsFrom, shapeResult, TOOLS } from "../../lib/mcp-server";
import { policyEditors, toolError, toolOk } from "../../lib/executor";

const allow = { read: true, create: true, edit: true, delete: false };
const kinds = (perm: typeof allow): InstanceAccess => ({ mode: "kinds", perm });

function inst(alias: string, over: Partial<ReachableInstance> = {}): ReachableInstance {
  return {
    id: `id-${alias}`,
    alias,
    integrationId: "int-dokploy",
    integrationSlug: "dokploy",
    integrationTitle: "Dokploy",
    integrationOrgSlug: "zeqqat",
    access: kinds(allow),
    ...over,
  };
}

const who = {
  organizationSlug: "acme_corp",
  organizationKind: "organization" as const,
  workspaceName: "Engineering",
  connectionName: "deployment",
  notice: null,
};
const personal = { ...who, organizationSlug: "perminus_gaita", organizationKind: "personal" as const };

const stats = new Map<string, CatalogStats>([
  ["int-dokploy", { toolCount: 412, categories: ["application", "docker", "project"] }],
  ["int-coolify", { toolCount: 90, categories: ["servers"] }],
]);

describe("contextFrom", () => {
  it("groups instances under @author/slug with a policy summary", () => {
    const c = contextFrom(who, [
      inst("prod", { access: kinds({ read: true, create: false, edit: false, delete: false }) }),
      inst("staging"),
      inst("home", { integrationId: "int-coolify", integrationSlug: "coolify", integrationTitle: "Coolify", integrationOrgSlug: "gaita" }),
    ]);
    expect(c.account).toEqual({ username: "acme_corp", type: "organization" });
    expect("namespace" in c).toBe(false);
    expect(c.connection).toBe("deployment");
    expect(c.integrations.map((g) => g.name)).toEqual(["@zeqqat/dokploy", "@gaita/coolify"]);
    expect(c.integrations[0].instances).toEqual([
      { name: "prod", policy: null, policySummary: "Allowed: read. Not allowed: create, edit, delete." },
      { name: "staging", policy: null, policySummary: "Allowed: read, create, edit. Not allowed: delete." },
    ]);
    expect(c.missing).toMatch(/not on this connection/);
  });

  it("names a personal account by its username", () => {
    // A collaborator calling through someone else's personal account still
    // sees the owner: the context is built from the connection's account.
    expect(contextFrom(personal, [inst("prod")]).account).toEqual({ username: "perminus_gaita", type: "personal" });
  });

  it("carries the tool count everywhere and the categories only in the full context", () => {
    const compact = contextFrom(who, [inst("prod")], { stats });
    expect(compact.integrations[0].toolCount).toBe(412);
    expect("categories" in compact.integrations[0]).toBe(false);
    expect(compact.missing).toMatch(/zeqqat_whoami to see each integration's tool categories/);

    const full = contextFrom(who, [inst("prod")], { stats, full: true });
    expect(full.integrations[0]).toMatchObject({ toolCount: 412, categories: ["application", "docker", "project"] });
    expect(full.missing).not.toMatch(/categories/);
  });

  it("keeps the tool count in the shortened context", () => {
    const many = Array.from({ length: FULL_CONTEXT_MAX_INSTANCES + 1 }, (_, i) => inst(`i${i}`));
    expect(contextFrom(who, many, { stats }).integrations[0].toolCount).toBe(412);
  });

  it("sorts categories and drops untagged endpoints", () => {
    expect(sortedCategories(["project", null, "application", "project", "", undefined, "docker"])).toEqual([
      "application",
      "docker",
      "project",
    ]);
  });

  it("shortens to counts above the limit, unless full", () => {
    const many = Array.from({ length: FULL_CONTEXT_MAX_INSTANCES + 1 }, (_, i) => inst(`i${i}`));
    expect(contextFrom(who, many).integrations[0].instances).toEqual([]);
    expect(contextFrom(who, many, { full: true }).integrations[0].instances).toHaveLength(many.length);
  });
});

const policyAccess = (role: keyof typeof ROLE_CAP): InstanceAccess => ({
  mode: "policy",
  roleCap: ROLE_CAP[role],
  policy: {
    id: "p1",
    canonical: "@gaita/dokploy.policy.read_plus_deploy",
    name: "read_plus_deploy",
    description: "Read apps, deploy apps.",
    allow: ["application.one", "application.deploy"],
    specRelease: "v0.28",
    version: 3,
    namespace: "gaita",
    integrationSlug: "dokploy",
  },
});

describe("policy access", () => {
  it("allows only listed tools, whatever their kind", () => {
    const a = policyAccess("admin");
    expect(toolAllowed(a, { name: "application.deploy", kind: "edit" })).toBe(true);
    expect(toolAllowed(a, { name: "application.stop", kind: "edit" })).toBe(false);
    expect(toolAllowed(a, { name: "project.all", kind: "read" })).toBe(false);
  });

  it("still applies the role cap on top", () => {
    expect(toolAllowed(policyAccess("viewer"), { name: "application.deploy", kind: "edit" })).toBe(false);
    expect(toolAllowed(policyAccess("viewer"), { name: "application.one", kind: "read" })).toBe(true);
  });

  it("allows by kind when no policy is attached, and nothing when unreachable", () => {
    expect(toolAllowed(kinds(allow), { name: "anything", kind: "edit" })).toBe(true);
    expect(toolAllowed(kinds(allow), { name: "anything", kind: "delete" })).toBe(false);
    expect(toolAllowed({ mode: "none" }, { name: "anything", kind: "read" })).toBe(false);
  });

  it("summarizes a policy with its description and the role's limits", () => {
    expect(accessSummary(policyAccess("admin"))).toBe("Read apps, deploy apps.");
    expect(accessSummary(policyAccess("member"))).toBe("Read apps, deploy apps. Your role can't delete.");
    expect(accessSummary(kinds({ read: false, create: false, edit: false, delete: false }))).toMatch(/Nothing allowed/);
  });

  it("names the policy in the context", () => {
    const c = contextFrom(who, [inst("prod", { access: policyAccess("admin") })]);
    expect(c.integrations[0].instances[0]).toEqual({
      name: "prod",
      policy: "@gaita/dokploy.policy.read_plus_deploy",
      policySummary: "Read apps, deploy apps.",
    });
  });
});

describe("shapeResult", () => {
  const context = contextFrom(who, [inst("prod")]);

  it("puts the context first in content and in structuredContent on success", () => {
    const r = shapeResult(context, toolOk({ matches: [] }, "no matches"));
    expect(JSON.parse(r.content[0].text)).toEqual({ context });
    expect(r.content[1].text).toBe("no matches");
    expect(r).toMatchObject({ structuredContent: { context, result: { matches: [] } } });
    expect("isError" in r).toBe(false);
  });

  it("sends errors as text only, still with the context", () => {
    const r = shapeResult(context, toolError("Not sent: delete isn't allowed"));
    expect(r).toMatchObject({ isError: true });
    expect("structuredContent" in r).toBe(false);
    expect(JSON.parse(r.content[0].text)).toEqual({ context });
  });

  it("adds the sunset notice as its own block", () => {
    const r = shapeResult({ ...context, notice: "Moving to a new URL" }, toolOk(null, "ok"));
    expect(r.content.at(-1)?.text).toBe("Moving to a new URL");
  });
});

describe("instructionsFrom", () => {
  it("starts with the notice, names what is reachable and carries the context", () => {
    const text = instructionsFrom({ ...contextFrom(who, [inst("prod")]), notice: "Sunset soon." }, "admin");
    expect(text.startsWith("Sunset soon.")).toBe(true);
    expect(text).toContain("@zeqqat/dokploy, 0 tools (prod)");
    expect(text).toContain("owned by the organization account @acme_corp");
    expect(text).toContain('"account":{"username":"acme_corp","type":"organization"}');
    expect(text).not.toContain('"categories":');
    expect(text.length).toBeLessThanOrEqual(2000);
  });
});

describe("instructions budget", () => {
  it("stays under 2,000 characters with several integrations", () => {
    const insts = ["dokploy", "coolify", "cloudflare", "hetzner", "aws"].flatMap((slug) =>
      ["prod", "staging", "dev"].map((alias) =>
        inst(`${slug}_${alias}`, { integrationId: `int-${slug}`, integrationSlug: slug, integrationTitle: slug }),
      ),
    );
    const text = instructionsFrom(contextFrom(who, insts, { stats }), "admin");
    expect(text.length).toBeLessThanOrEqual(2000);
    // Not cut off: the context JSON at the end is whole.
    expect(() => JSON.parse(text.slice(text.indexOf("Context: ") + "Context: ".length))).not.toThrow();
  });
});

describe("policyEditors", () => {
  it("names the one owner of a personal account, or the owners of an organization", () => {
    expect(policyEditors(personal)).toBe("the owner, @perminus_gaita");
    expect(policyEditors(who)).toBe("an owner of @acme_corp");
  });
});

describe("TOOLS", () => {
  it("every tool declares an outputSchema requiring the context", () => {
    for (const t of TOOLS) {
      expect(t.outputSchema.required).toEqual(["context"]);
      expect(t.outputSchema.properties.context.required).toContain("integrations");
      expect(t.outputSchema.properties.context.required).toContain("account");
    }
  });

  it("every description except whoami's points to zeqqat_whoami", () => {
    for (const t of TOOLS.filter((x) => x.name !== "zeqqat_whoami")) expect(t.description).toContain("zeqqat_whoami");
  });
});
