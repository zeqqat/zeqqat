import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SELFHOST_COMPOSE } from "../../lib/selfhost-compose";

// The Dokploy template and the one-button install must run the same file,
// or template installs drift from what the button installs.
describe("self-host compose", () => {
  it("matches the Dokploy template's docker-compose.yml", () => {
    const file = readFileSync(join(__dirname, "../../deploy/dokploy/docker-compose.yml"), "utf8");
    expect(file).toBe(SELFHOST_COMPOSE);
  });

  it("follows latest and defaults to password sign-in", () => {
    expect(SELFHOST_COMPOSE).toContain("ghcr.io/zeqqat/zeqqat:${ZEQQAT_VERSION:-latest}");
    expect(SELFHOST_COMPOSE).toContain("pull_policy: always");
    expect(SELFHOST_COMPOSE).toContain("${ENABLED_AUTH_PROVIDERS:-password}");
  });

  // Dokploy writes a compose's environment to a .env file that only fills
  // in ${...} in the compose file: a variable the file doesn't name never
  // reaches the app. The seed missed this once, so the claim never showed.
  it("passes every variable the one-button install sets into the app", () => {
    for (const v of ["ZEQQAT_PUBLIC_URL", "POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "ZEQQAT_ENCRYPTION_KEY", "ZEQQAT_SEED"]) {
      expect(SELFHOST_COMPOSE).toContain(`\${${v}`);
    }
    expect(SELFHOST_COMPOSE).toMatch(/^\s+ZEQQAT_SEED: \$\{ZEQQAT_SEED:-\}$/m);
  });

  it("template meta says latest, not a number that goes stale", () => {
    const meta = JSON.parse(readFileSync(join(__dirname, "../../deploy/dokploy/meta.json"), "utf8"));
    expect(meta.version).toBe("latest");
  });
});

describe("first Dokploy template", () => {
  it("is recognised by its pinned 0.1.0 image, and the current file is not", async () => {
    const { isFirstTemplate } = await import("../../lib/self-update");
    const { SELFHOST_COMPOSE } = await import("../../lib/selfhost-compose");
    expect(isFirstTemplate("services:\n  zeqqat:\n    image: ghcr.io/zeqqat/zeqqat:0.1.0\n")).toBe(true);
    expect(isFirstTemplate(SELFHOST_COMPOSE)).toBe(false);
    expect(isFirstTemplate(undefined)).toBe(false);
  });
});
