import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { BUNDLED, compareVersions, mergeReleases } from "../../lib/changelog";
import { collectComposes, envMentionsHost, pinnedVersion } from "../../lib/self-update";

describe("changelog", () => {
  it("has an entry for the current version, on top", () => {
    // Every version bump adds what changed to content/changelog.json. The
    // footer's What's new modal and zeqqat.com/api/releases read it.
    expect(BUNDLED[0]?.version).toBe(pkg.version);
  });

  it("is newest first, one entry per version, each with changes", () => {
    for (let i = 1; i < BUNDLED.length; i++) {
      expect(compareVersions(BUNDLED[i - 1].version, BUNDLED[i].version)).toBe(1);
    }
    for (const r of BUNDLED) {
      expect(r.changes.length).toBeGreaterThan(0);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of r.changes) expect(c).not.toMatch(/—/);
    }
  });

  it("compares versions numerically", () => {
    expect(compareVersions("0.3.10", "0.3.9")).toBe(1);
    expect(compareVersions("0.3.9", "0.3.10")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });

  it("puts newer remote releases on top and skips pre-releases and junk", () => {
    const local = [{ version: "0.3.25", date: "2026-11-09", changes: ["a"] }];
    const remote = [
      { version: "0.3.27", date: "2026-11-11", changes: ["c"] },
      { version: "0.4.0-rc.1", date: "2026-11-11", changes: ["rc"] },
      { version: "0.3.26", date: "2026-11-10", changes: ["b"] },
      { version: "0.3.25", date: "2026-11-09", changes: ["remote copy"] },
      { nope: true } as never,
    ];
    expect(mergeReleases(local, remote).map((r) => r.version)).toEqual(["0.3.27", "0.3.26", "0.3.25"]);
    expect(mergeReleases(local, remote)[2].changes).toEqual(["a"]);
  });
});

describe("self-update", () => {
  it("finds composes anywhere in project.all", () => {
    const all = [
      { projectId: "p", environments: [{ compose: [{ composeId: "c1", name: "zeqqat" }], applications: [] }] },
      { projectId: "q", compose: [{ composeId: "c2" }] },
    ];
    expect(collectComposes(all).map((c) => c.composeId)).toEqual(["c1", "c2"]);
  });

  it("matches this install by ZEQQAT_PUBLIC_URL", () => {
    const env = "POSTGRES_PASSWORD=x\nZEQQAT_PUBLIC_URL=https://zq.example.com\n";
    expect(envMentionsHost(env, "zq.example.com")).toBe(true);
    expect(envMentionsHost(env, "other.example.com")).toBe(false);
    expect(envMentionsHost(null, "zq.example.com")).toBe(false);
  });

  it("notices a pinned version", () => {
    expect(pinnedVersion("ZEQQAT_VERSION=0.3.20")).toBe("0.3.20");
    expect(pinnedVersion("ZEQQAT_VERSION=latest")).toBeNull();
    expect(pinnedVersion("ZEQQAT_VERSION=")).toBeNull();
    expect(pinnedVersion("OTHER=1")).toBeNull();
  });
});
