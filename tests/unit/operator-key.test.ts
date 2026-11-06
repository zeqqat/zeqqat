import { afterEach, describe, expect, it } from "vitest";
import { checkOperatorKey } from "../../lib/operator";

const KEY = "k".repeat(40);
const req = (auth?: string) => new Request("http://x/api/operator/summary", { headers: auth ? { authorization: auth } : {} });

describe("checkOperatorKey", () => {
  afterEach(() => {
    delete process.env.ZEQQAT_OPERATOR_KEY;
  });

  it("is off (null) without a key, or with one under 32 characters", () => {
    expect(checkOperatorKey(req(`Bearer ${KEY}`))).toBeNull();
    process.env.ZEQQAT_OPERATOR_KEY = "short";
    expect(checkOperatorKey(req("Bearer short"))).toBeNull();
  });

  it("accepts only the exact key as a Bearer token", () => {
    process.env.ZEQQAT_OPERATOR_KEY = KEY;
    expect(checkOperatorKey(req(`Bearer ${KEY}`))).toBe(true);
    expect(checkOperatorKey(req(`Bearer ${KEY}x`))).toBe(false);
    expect(checkOperatorKey(req())).toBe(false);
  });
});
