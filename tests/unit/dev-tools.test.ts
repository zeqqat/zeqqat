import { afterEach, describe, expect, it } from "vitest";
import {
  devToolsEnabled,
  originalAccountId,
  originalEmail,
  retiredAccountId,
  retiredEmail,
  sameIdentity,
} from "../../lib/dev-tools";

describe("dev tools", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("is off unless asked for, and never on zeqqat.com", () => {
    process.env.ZEQQAT_PUBLIC_URL = "https://dev.zeqqat.com";
    delete process.env.ZEQQAT_DEV_TOOLS;
    expect(devToolsEnabled()).toBe(false);
    process.env.ZEQQAT_DEV_TOOLS = "1";
    expect(devToolsEnabled()).toBe(true);
    process.env.ZEQQAT_PUBLIC_URL = "https://zeqqat.com";
    expect(devToolsEnabled()).toBe(false);
  });

  it("round-trips a retired email and sign-in link", () => {
    const e = retiredEmail("Gaita+X@Example.com", 1731151200000);
    expect(e).toMatch(/@retired\.invalid$/);
    expect(originalEmail(e)).toBe("gaita+x@example.com");
    expect(originalEmail("gaita@example.com")).toBeNull();
    const a = retiredAccountId("10987:654", 1731151200000);
    expect(originalAccountId(a)).toBe("10987:654");
    expect(originalAccountId("10987654")).toBeNull();
  });

  it("matches the same person by email or provider account", () => {
    const at = 1;
    const current = { email: "me@example.com", links: [{ providerId: "google", accountId: "g-1" }] };
    expect(sameIdentity(current, { email: retiredEmail("me@example.com", at), links: [] })).toBe(true);
    expect(
      sameIdentity(current, { email: retiredEmail("old@example.com", at), links: [{ providerId: "google", accountId: retiredAccountId("g-1", at) }] }),
    ).toBe(true);
    expect(
      sameIdentity(current, { email: retiredEmail("other@example.com", at), links: [{ providerId: "github", accountId: retiredAccountId("g-1", at) }] }),
    ).toBe(false);
  });
});
