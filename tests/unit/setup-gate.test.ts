import { describe, expect, it } from "vitest";
import { openWithoutDokploy } from "../../lib/setup-gate";

describe("openWithoutDokploy", () => {
  it("keeps the overview and Releases open", () => {
    for (const p of ["/app", "/app/", "/app/releases", "/app/releases/"]) expect(openWithoutDokploy(p)).toBe(true);
  });
  it("holds every other dashboard page back", () => {
    for (const p of [
      "/app/connections",
      "/app/integrations",
      "/app/instances/abc",
      "/app/tools",
      "/app/policies/new",
      "/app/activity",
      "/app/team",
      "/app/settings",
      "/app/self-host",
      "/app/releases-old",
    ]) {
      expect(openWithoutDokploy(p)).toBe(false);
    }
  });
});
