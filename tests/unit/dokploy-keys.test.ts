import { describe, expect, it } from "vitest";
import { dokployKeyHash, matchKey } from "../../lib/dokploy-keys";

// The key zeqqat.com holds for an instance, found among the Dokploy user's
// keys so it can delete itself (lib/dokploy-keys.ts). Prefixes below are
// the ones on a real Dokploy: several share their first characters.
const KEY = "zeqqat_mainAbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const row = (id: string, prefix: string | null, extra: { start?: string; key?: string } = {}) => ({
  id,
  name: `key ${id}`,
  prefix,
  createdAt: "2026-11-08T17:27:52.737Z",
  start: extra.start ?? null,
  key: extra.key ?? null,
});

describe("dokployKeyHash", () => {
  it("is what Dokploy stores: SHA-256, base64url, no padding (@better-auth/api-key 1.6.23)", () => {
    // Worked out separately: base64.urlsafe_b64encode(sha256(key)).rstrip("=")
    expect(dokployKeyHash(KEY)).toBe("QnN1qNeSFK0vZMBOOzqzQGDH7q27pesiIIU3p8O1al4");
  });
});

describe("matchKey", () => {
  const real = [row("a", "dev_gaita_2"), row("b", "z_dev_3"), row("c", "z_dev"), row("d", "zeqqat_dev"), row("e", "zeqqat_main")];

  it("matches the hash exactly when Dokploy returns hashes", () => {
    const rows = real.map((r) => ({ ...r, start: "zeqqat", key: r.id === "e" ? dokployKeyHash(KEY) : dokployKeyHash(`other-${r.id}`) }));
    expect(matchKey(rows, KEY)).toEqual({ id: "e" });
  });

  it("with hashes, a key that isn't there is not found (never guessed)", () => {
    const rows = real.map((r) => ({ ...r, key: dokployKeyHash(`other-${r.id}`) }));
    expect(matchKey(rows, KEY)).toEqual({ none: true });
  });

  it("without hashes, the longest prefix the key starts with wins", () => {
    expect(matchKey(real, KEY)).toEqual({ id: "e" });
    expect(matchKey(real, "z_dev_3QwErTy")).toEqual({ id: "b" });
    expect(matchKey(real, "z_devQwErTy")).toEqual({ id: "c" });
  });

  it("two keys with the same prefix: the owner picks", () => {
    const m = matchKey([...real, row("f", "zeqqat_main")], KEY);
    expect("pick" in m && m.pick.map((k) => k.id).sort()).toEqual(["e", "f"]);
  });

  it("never offers a self-hosted install's own key", () => {
    const m = matchKey([row("s", "zqself_"), row("n", null)], "abc");
    expect("pick" in m && m.pick.map((k) => k.id)).toEqual(["n"]);
  });
});
