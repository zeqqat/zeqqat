import { describe, expect, it } from "vitest";
import { safeNext } from "../../lib/next-path";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/app/integrations?add=app&spec=https%3A%2F%2Fx")).toBe("/app/integrations?add=app&spec=https%3A%2F%2Fx");
  });
  it("refuses other sites and junk", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", undefined, ["/app"]]) {
      expect(safeNext(bad as string | undefined)).toBe("/app");
    }
  });
});
