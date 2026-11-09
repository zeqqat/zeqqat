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

  it("template meta says latest, not a number that goes stale", () => {
    const meta = JSON.parse(readFileSync(join(__dirname, "../../deploy/dokploy/meta.json"), "utf8"));
    expect(meta.version).toBe("latest");
  });
});
