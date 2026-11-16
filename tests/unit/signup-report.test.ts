import { describe, expect, it } from "vitest";
import { shouldReportSignup, SIGNUP_REPORT_WINDOW_MS } from "../../lib/signup-report";

describe("shouldReportSignup", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("reports a new account once", () => {
    expect(shouldReportSignup({ createdAt: new Date(now - 60_000), signupReportedAt: null }, now)).toBe(true);
  });
  it("never reports twice", () => {
    expect(shouldReportSignup({ createdAt: new Date(now - 60_000), signupReportedAt: new Date(now) }, now)).toBe(false);
  });
  it("skips accounts older than the window", () => {
    expect(shouldReportSignup({ createdAt: new Date(now - SIGNUP_REPORT_WINDOW_MS - 1), signupReportedAt: null }, now)).toBe(false);
  });
});
