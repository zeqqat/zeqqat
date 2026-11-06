import { describe, expect, it } from "vitest";
import { DEFAULT_TELEMETRY_URL, pingSchema, telemetryEnabled, telemetryUrl } from "../../lib/telemetry";

const prodSelfHosted = { NODE_ENV: "production", DATABASE_URL: "postgres://x" };

describe("telemetryEnabled", () => {
  it("is on for a production self-hosted install by default", () => {
    expect(telemetryEnabled(prodSelfHosted)).toBe(true);
  });

  it.each(["0", "false", "off", "no", "FALSE", " 0 "])("is off with ZEQQAT_TELEMETRY=%j", (v) => {
    expect(telemetryEnabled({ ...prodSelfHosted, ZEQQAT_TELEMETRY: v })).toBe(false);
  });

  it("respects DO_NOT_TRACK=1", () => {
    expect(telemetryEnabled({ ...prodSelfHosted, DO_NOT_TRACK: "1" })).toBe(false);
  });

  it("never sends from the hosted edition, dev servers or without a database", () => {
    expect(telemetryEnabled({ ...prodSelfHosted, ZEQQAT_EDITION: "cloud" })).toBe(false);
    expect(telemetryEnabled({ ...prodSelfHosted, NODE_ENV: "development" })).toBe(false);
    expect(telemetryEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("telemetryUrl", () => {
  it("defaults to zeqqat.com and can be overridden", () => {
    expect(telemetryUrl({})).toBe(DEFAULT_TELEMETRY_URL);
    expect(telemetryUrl({ ZEQQAT_TELEMETRY_URL: "https://example.test/ping" })).toBe("https://example.test/ping");
  });
});

describe("pingSchema", () => {
  const ok = { installId: "01a1a70f-9c22-7929-8dc9-fc87cd691514", version: "0.2.1" };

  it("accepts exactly an install id and a version", () => {
    expect(pingSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects extra fields, so nothing else can ride along", () => {
    expect(pingSchema.safeParse({ ...ok, email: "a@b.c" }).success).toBe(false);
  });

  it("rejects malformed ids and versions", () => {
    expect(pingSchema.safeParse({ ...ok, installId: "not-a-uuid" }).success).toBe(false);
    expect(pingSchema.safeParse({ ...ok, version: "<script>" }).success).toBe(false);
    expect(pingSchema.safeParse({ ...ok, version: "x".repeat(33) }).success).toBe(false);
  });
});
