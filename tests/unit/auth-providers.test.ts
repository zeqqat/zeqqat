import { afterEach, describe, expect, it, vi } from "vitest";

// Which sign-in methods render, per edition. zeqqat.com never offers
// passwords (every account there proves its email through a provider); a
// self-hosted install defaults to password, which needs no outside setup.
async function providersWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("../../lib/auth-providers")).signInProviders;
}

describe("sign-in providers", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("self-hosted defaults to password", async () => {
    expect(await providersWith({ ZEQQAT_EDITION: undefined, ENABLED_AUTH_PROVIDERS: undefined })).toEqual(["password"]);
  });

  it("cloud defaults to Google", async () => {
    expect(await providersWith({ ZEQQAT_EDITION: "cloud", ENABLED_AUTH_PROVIDERS: undefined })).toEqual(["google"]);
  });

  it("cloud never offers password, even when listed", async () => {
    expect(await providersWith({ ZEQQAT_EDITION: "cloud", ENABLED_AUTH_PROVIDERS: "google,password" })).toEqual(["google"]);
  });

  it("self-hosted can combine password with GitHub", async () => {
    expect(
      await providersWith({ ZEQQAT_EDITION: undefined, ENABLED_AUTH_PROVIDERS: "github, password", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" }),
    ).toEqual(["github", "password"]);
  });

  it("self-hosted with GitHub listed but no keys falls back to password (first Dokploy template)", async () => {
    expect(
      await providersWith({ ZEQQAT_EDITION: undefined, ENABLED_AUTH_PROVIDERS: "github", GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" }),
    ).toEqual(["password"]);
  });

  it("self-hosted keeps GitHub when its keys are set", async () => {
    expect(
      await providersWith({ ZEQQAT_EDITION: undefined, ENABLED_AUTH_PROVIDERS: "github", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" }),
    ).toEqual(["github"]);
  });
});
