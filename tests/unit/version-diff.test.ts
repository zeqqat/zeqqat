import { describe, expect, it } from "vitest";
import { changedPart } from "../../lib/version-diff";

describe("changedPart", () => {
  it("marks the part a newer release changed", () => {
    expect(changedPart("v0.31.2", "v0.31.4")).toBe(2);
    expect(changedPart("v0.28.4", "v0.29.13")).toBe(1);
    expect(changedPart("v0.31.4", "v1.0.0")).toBe(0);
    expect(changedPart("0.31.2", "v0.31.4")).toBe(2);
  });
  it("marks nothing when up to date, ahead, or not comparable", () => {
    expect(changedPart("v0.31.4", "v0.31.4")).toBeNull();
    expect(changedPart("v0.32.0", "v0.31.4")).toBeNull();
    expect(changedPart("canary", "v0.31.4")).toBeNull();
    expect(changedPart(null, "v0.31.4")).toBeNull();
    expect(changedPart("v0.31.2", null)).toBeNull();
  });
});
