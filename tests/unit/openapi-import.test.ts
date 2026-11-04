import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { basePathOf, convertOpenApi, KINDS, UNCLASSIFIED_KIND, type KindMap } from "../../lib/importer/openapi";

const dir = join(__dirname, "../../catalog/dokploy");
const rawSpec = readFileSync(join(dir, "openapi.json"), "utf8");
const spec = JSON.parse(rawSpec);
const kindsFile = JSON.parse(readFileSync(join(dir, "kinds.json"), "utf8")) as { specSha256: string; kinds: KindMap };
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const summaries = (JSON.parse(readFileSync(join(dir, manifest.summaries), "utf8")) as { summaries: Record<string, string> })
  .summaries;

const convert = (extra: Partial<Parameters<typeof convertOpenApi>[1]> = {}) =>
  convertOpenApi(spec, {
    orgSlug: "zeqqat",
    integrationSlug: "dokploy",
    kinds: kindsFile.kinds,
    summaries,
    nameFrom: "path",
    ...extra,
  });

describe("bundled Dokploy catalog", () => {
  const { endpoints, warnings } = convert();
  const byName = new Map(endpoints.map((e) => [e.name, e]));

  it("imports every operation with no document-level warnings", () => {
    const operations = Object.values(spec.paths as Record<string, object>).reduce(
      (n: number, item) => n + Object.keys(item).filter((k) => ["get", "post", "put", "patch", "delete"].includes(k)).length,
      0,
    );
    expect(endpoints).toHaveLength(operations);
    expect(warnings).toEqual([]);
  });

  it("names endpoints by tRPC procedure, as the existing rows and policies do", () => {
    expect(manifest.nameFrom).toBe("path");
    expect(byName.has("application.stop")).toBe(true);
    expect(byName.has("application-stop")).toBe(false);
  });

  it("keeps the kind map in step with the spec: every endpoint classified, nothing extra", () => {
    const names = new Set(endpoints.map((e) => e.name));
    const unclassified = [...names].filter((n) => !(n in kindsFile.kinds));
    const stale = Object.keys(kindsFile.kinds).filter((n) => !names.has(n));
    expect(unclassified).toEqual([]);
    expect(stale).toEqual([]);
    expect(kindsFile.specSha256).toBe(createHash("sha256").update(rawSpec).digest("hex"));
    for (const e of endpoints) expect(KINDS).toContain(e.kind);
  });

  it("keeps the kinds of the five endpoints that existed before the import", () => {
    expect(byName.get("application.deploy")?.kind).toBe("edit");
    expect(byName.get("application.stop")?.kind).toBe("edit");
    expect(byName.get("application.one")?.kind).toBe("read");
    expect(byName.get("application.readLogs")?.kind).toBe("read");
    expect(byName.get("project.all")?.kind).toBe("read");
  });

  it("classifies data-destroying endpoints as delete even when the name doesn't say so", () => {
    expect(byName.get("postgres.rebuild")?.kind).toBe("delete");
    expect(byName.get("settings.cleanUnusedVolumes")?.kind).toBe("delete");
    expect(byName.get("notification.testSlackConnection")?.kind).toBe("edit");
    expect(byName.get("compose.previewTemplate")?.kind).toBe("read");
  });

  it("prefixes paths with the spec's server base path, which the executor needs", () => {
    expect(basePathOf(spec)).toBe("/api");
    expect(byName.get("application.stop")?.path).toBe("/api/application.stop");
    expect(byName.get("application.one")?.method).toBe("GET");
  });

  it("merges GET query parameters and POST bodies into one input schema", () => {
    expect(byName.get("application.one")?.inputSchema).toMatchObject({
      type: "object",
      properties: { applicationId: { type: "string" } },
      required: ["applicationId"],
    });
    expect(byName.get("application.stop")?.inputSchema).toMatchObject({
      properties: { applicationId: { type: "string" } },
      required: ["applicationId"],
    });
  });

  it("reads auth from securitySchemes, ignoring Dokploy's undefined per-operation scheme", () => {
    for (const e of endpoints) expect(e.credentialScheme).toEqual({ type: "apiKey", in: "header", name: "x-api-key" });
  });

  it("stores no output schema for Dokploy's empty placeholder responses", () => {
    expect(byName.get("project.all")?.outputSchema).toBeNull();
  });

  it("gives every endpoint a unique, valid action", () => {
    const actions = endpoints.map((e) => e.action);
    expect(new Set(actions).size).toBe(actions.length);
    for (const a of actions) expect(a).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    expect(byName.get("application.readLogs")?.action).toBe("application_read_logs");
  });

  it("flags the multipart uploads the executor can't send", () => {
    expect(byName.get("application.dropDeployment")?.importWarnings.join(" ")).toMatch(/not supported/);
    expect(byName.get("application.stop")?.importWarnings).toEqual([]);
  });

  it("gives every endpoint a written summary, since Dokploy's spec has none", () => {
    const names = new Set(endpoints.map((e) => e.name));
    expect(endpoints.filter((e) => !e.summary).map((e) => e.name)).toEqual([]);
    expect(Object.keys(summaries).filter((n) => !names.has(n))).toEqual([]);
    for (const s of Object.values(summaries)) expect(s.length).toBeLessThanOrEqual(120);
    expect(byName.get("postgres.rebuild")?.summary).toMatch(/Wipes all its data/);
  });

  it("prefers the spec's own summary over the written one", () => {
    const doc = { openapi: "3.1.0", paths: { "/a.b": { get: { summary: "From the spec" } } } };
    const [e] = convertOpenApi(doc, {
      orgSlug: "zeqqat",
      integrationSlug: "t",
      kinds: { "a.b": "read" },
      summaries: { "a.b": "Written" },
      nameFrom: "path",
    }).endpoints;
    expect(e.summary).toBe("From the spec");
  });

  it("uses the first spec tag as the category", () => {
    expect(byName.get("application.stop")?.tags[0]).toBe("application");
  });
});

describe("convertOpenApi", () => {
  it("keeps an existing endpoint's action and never reuses it for a new one", () => {
    const existingActions = new Map([
      ["application.stop", "application_stop"],
      ["legacy.thing", "application_one"],
    ]);
    const byName = new Map(convert({ existingActions }).endpoints.map((e) => [e.name, e]));
    expect(byName.get("application.stop")?.action).toBe("application_stop");
    expect(byName.get("application.one")?.action).toBe("application_one_2");
  });

  it("sets an unclassified endpoint to delete and says so", () => {
    const { endpoints } = convert({ kinds: {} });
    expect(endpoints[0].kind).toBe(UNCLASSIFIED_KIND);
    expect(UNCLASSIFIED_KIND).toBe("delete");
    expect(endpoints[0].importWarnings.join(" ")).toMatch(/Kind not assigned/);
  });

  it("names by operationId by default", () => {
    const { endpoints } = convertOpenApi(spec, { orgSlug: "zeqqat", integrationSlug: "dokploy", kinds: {} });
    expect(endpoints.some((e) => e.name === "application-stop")).toBe(true);
  });

  it("refuses external refs instead of fetching them", () => {
    const doc = {
      openapi: "3.1.0",
      paths: {
        "/x": {
          post: {
            operationId: "x",
            requestBody: { content: { "application/json": { schema: { $ref: "https://evil.example/schema.json" } } } },
          },
        },
      },
    };
    const [e] = convertOpenApi(doc, { orgSlug: "zeqqat", integrationSlug: "t", kinds: { x: "edit" } }).endpoints;
    expect(e.importWarnings.join(" ")).toMatch(/Unresolvable reference/);
  });
});
