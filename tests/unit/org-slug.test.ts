import { describe, expect, it } from "vitest";
import { deriveUsername, isReserved, isValidOrgSlug, normalizeSlug } from "../../lib/username";

// Naming doc v2, section 1: org slugs are lowercase snake_case.
describe("org slugs", () => {
  it.each([
    ["Perminus Gaita", "perminus_gaita"],
    ["acme-corp", "acme_corp"],
    ["  Acme  Corp!! ", "acme_corp"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizeSlug(raw)).toBe(expected);
  });

  it("derives from the email when the name is too short", () => {
    expect(deriveUsername("A", "jane.doe@example.com")).toBe("jane_doe");
  });

  it.each(["acme_corp", "gaita", "plan9"])("accepts %s", (s) => expect(isValidOrgSlug(s)).toBe(true));
  it.each(["acme-corp", "Acme", "_acme", "acme_", "a__b", "a"])("rejects %s", (s) => expect(isValidOrgSlug(s)).toBe(false));

  it.each(["api", "oauth", "mcp", "docs", "admin", "zeqqat", "login", "settings", "c", "w", "t", "app", "signin", "invite"])(
    "reserves %s",
    (s) => expect(isReserved(s)).toBe(true),
  );
});
