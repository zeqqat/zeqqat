import { describe, expect, it } from "vitest";
import { signInErrorText } from "../../lib/sign-in-errors";

describe("sign-in error text", () => {
  it("says why when the provider round trip lost its state cookie", () => {
    expect(signInErrorText("state_mismatch")).toMatch(/took too long/);
    expect(signInErrorText("state_not_found")).toMatch(/took too long/);
  });

  it("falls back to a generic line for unknown codes, and nothing without a code", () => {
    expect(signInErrorText("something_else")).toBe("Sign-in didn't work. Try again.");
    expect(signInErrorText(undefined)).toBeNull();
  });
});
