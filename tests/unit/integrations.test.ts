import { describe, expect, it } from "vitest";
import { compareOps, opsFromSpec } from "../../lib/instance-spec";
import { compareVersions } from "../../lib/integrations";

describe("opsFromSpec", () => {
  it("names operations by path, the way the Dokploy catalog does", () => {
    const s = opsFromSpec({
      info: { version: "v0.31.2" },
      paths: { "/application.one": { get: {} }, "/application.deployNginxQuickstart": { post: {} } },
    });
    expect(s?.version).toBe("v0.31.2");
    expect(s?.ops).toEqual([
      { name: "application.deployNginxQuickstart", method: "POST" },
      { name: "application.one", method: "GET" },
    ]);
  });
  it("refuses something that isn't a spec", () => {
    expect(opsFromSpec(null)).toBeNull();
    expect(opsFromSpec({ info: {} })).toBeNull();
  });
});

describe("compareOps", () => {
  it("finds tools on the instance the integration lacks, and the other way round", () => {
    const c = compareOps(
      [
        { name: "a", method: "GET" },
        { name: "new", method: "POST" },
      ],
      new Set(["a", "gone"]),
    );
    expect(c?.extra.map((o) => o.name)).toEqual(["new"]);
    expect(c?.missing).toEqual(["gone"]);
  });
  it("knows nothing until the instance's spec was read", () => {
    expect(compareOps(null, new Set(["a"]))).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders Dokploy versions", () => {
    expect(compareVersions("v0.31.2", "v0.30.4")).toBe(1);
    expect(compareVersions("v0.29.8", "v0.31.2")).toBe(-1);
    expect(compareVersions("v0.31.2", "0.31.2")).toBe(0);
    expect(compareVersions("v0.31.10", "v0.31.9")).toBe(1);
  });
  it("gives no answer for a release that isn't a version", () => {
    expect(compareVersions("canary@2026-10-31", "v0.31.2")).toBeNull();
    expect(compareVersions(null, "v0.31.2")).toBeNull();
  });
});
