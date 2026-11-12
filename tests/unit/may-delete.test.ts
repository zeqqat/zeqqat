import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ db: {} }));

import { mayDelete } from "../../lib/mcp-context";

const NONE = { read: false, create: false, edit: false, delete: false };
const inst = (access: unknown) =>
  ({
    id: "i",
    alias: "a",
    integrationId: "x",
    integrationSlug: "dokploy",
    integrationTitle: "Dokploy",
    integrationOrgSlug: "zeqqat",
    access,
  }) as never;

describe("mayDelete", () => {
  it("is false when nothing allows delete", async () => {
    expect(await mayDelete([inst({ mode: "kinds", perm: { ...NONE, read: true, create: true, edit: true } })])).toBe(
      false,
    );
  });

  it("is true when any instance allows delete by kind", async () => {
    expect(
      await mayDelete([inst({ mode: "kinds", perm: NONE }), inst({ mode: "kinds", perm: { ...NONE, delete: true } })]),
    ).toBe(true);
  });

  it("skips a policy the caller's role can't delete with", async () => {
    const policy = { allow: ["application.delete"] };
    expect(await mayDelete([inst({ mode: "policy", policy, roleCap: NONE })])).toBe(false);
  });

  it("is false with no instances", async () => {
    expect(await mayDelete([])).toBe(false);
  });
});
