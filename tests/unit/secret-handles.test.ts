import { describe, expect, it } from "vitest";
import { scrubSecrets } from "../../lib/scrub";
import { findHandles, generateValue, HandleMinter, secretField } from "../../lib/secret-handles";

// Secret handles: secrets found in a response become {{zq_secret_...}},
// and handles resolve only in fields meant for secrets.

const HANDLE = /^\{\{zq_secret_[a-z0-9]{16}\}\}$/;

describe("minting handles while scrubbing", () => {
  it("replaces each secret with a handle, the same value with the same handle", () => {
    const minter = new HandleMinter();
    const out = scrubSecrets(
      {
        databasePassword: "s3cr3t-pa55-word",
        env: "NODE_ENV=production\nDATABASE_URL=postgres://app:s3cr3t-pa55-word@db:5432/app",
        name: "My App",
      },
      0,
      minter.redact,
    );
    expect(out.databasePassword).toMatch(HANDLE);
    expect(out.name).toBe("My App");
    expect(out.env).toContain("NODE_ENV=production");
    // The URL keeps its shape, with the password as the same handle.
    expect(out.env).toContain(`DATABASE_URL=postgres://app:${out.databasePassword}@db:5432/app`);
    expect(JSON.stringify(out)).not.toContain("s3cr3t-pa55-word");
    expect(minter.count).toBe(1);
  });

  it("gives raw text and the parsed body the same handles", () => {
    const minter = new HandleMinter();
    const raw = JSON.stringify({ token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
    const text = scrubSecrets(raw, 0, minter.redact);
    const parsed = scrubSecrets(JSON.parse(raw), 0, minter.redact) as { token: string };
    expect(text).toContain(parsed.token);
    expect(minter.count).toBe(1);
  });

  it("leaves a value that is already a handle alone", () => {
    const minter = new HandleMinter();
    const out = scrubSecrets({ password: "{{zq_secret_aaaaaaaaaaaaaaaa}}" }, 0, minter.redact);
    expect(out.password).toBe("{{zq_secret_aaaaaaaaaaaaaaaa}}");
    expect(minter.count).toBe(0);
  });

  it("still redacts plainly without a minter", () => {
    expect(scrubSecrets({ password: "hunter2hunter2" }).password).toBe("[redacted by zeqqat]");
  });
});

describe("where handles may go", () => {
  it("accepts env blocks and secret-named fields", () => {
    expect(secretField(["env"])).toBe(true);
    expect(secretField(["buildSecrets"])).toBe(true);
    expect(secretField(["databasePassword"])).toBe(true);
    expect(secretField(["auth", "apiKey"])).toBe(true);
  });

  it("refuses fields that could send the value elsewhere", () => {
    expect(secretField(["webhookUrl"])).toBe(false);
    expect(secretField(["description"])).toBe(false);
    expect(secretField(["name"])).toBe(false);
    expect(secretField([])).toBe(false);
  });

  it("finds every handle with the path it sits in", () => {
    const found = findHandles({
      env: "DATABASE_URL=postgresql://zeqqat:{{zq_secret_aaaaaaaaaaaaaaaa}}@db:5432/zeqqat",
      nested: { databasePassword: "{{ zq_secret_bbbbbbbbbbbbbbbb }}" },
      name: "no handle here",
    });
    expect(found).toEqual([
      { id: "zq_secret_aaaaaaaaaaaaaaaa", path: ["env"] },
      { id: "zq_secret_bbbbbbbbbbbbbbbb", path: ["nested", "databasePassword"] },
    ]);
  });
});

describe("generated values", () => {
  it("makes URL-safe passwords and byte-sized keys", () => {
    expect(generateValue("password", 32)).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(Buffer.from(generateValue("base64", 32), "base64").length).toBe(32);
    expect(generateValue("hex", 24)).toMatch(/^[0-9a-f]{48}$/);
    expect(generateValue("password", 32)).not.toBe(generateValue("password", 32));
  });
});
