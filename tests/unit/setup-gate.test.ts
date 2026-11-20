import { describe, expect, it } from "vitest";
import { openWithoutDokploy } from "../../lib/setup-gate";

describe("openWithoutDokploy", () => {
  it("keeps the overview and Releases open", () => {
    for (const p of ["", "/", "/releases", "/releases/"]) expect(openWithoutDokploy(p)).toBe(true);
  });
  it("holds every other dashboard page back", () => {
    for (const p of [
      "/mcp-urls",
      "/dokploy-instances",
      "/dokploy-instances/abc",
      "/tools",
      "/dokploy-integrations",
      "/policies/new",
      "/activity",
      "/members",
      "/settings",
      "/self-host",
      "/releases-old",
    ]) {
      expect(openWithoutDokploy(p)).toBe(false);
    }
  });
});
