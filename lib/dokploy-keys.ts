import { createHash } from "node:crypto";
import { dokploy, InstallError, SELFHOST_KEY_PREFIX, type Target } from "./selfhost-install";

// Finding and deleting the Dokploy API key zeqqat.com holds for an
// instance, after its owner moved to their own Zeqqat ("Delete the key" on
// the self-host page). Dokploy can't switch a key off, only delete it, and
// it never tells a caller which key it is calling with. What it stores per
// key (Better Auth's api-key plugin, @better-auth/api-key 1.6.23 in
// Dokploy): id, name, prefix, `start` (the key's first 6 characters, prefix
// included) and `key`, the SHA-256 of the key in base64url without padding.
// Never the end of the key.
//
// We hold the key itself, so we hash it the same way and match it
// exactly. Only `user.getBackups` returns the hashes (it returns every
// column of the user's keys; admins only). Otherwise `user.get` lists id,
// name and prefix, and the key whose prefix is the longest one the key
// starts with wins. When that still isn't one key, the owner picks.

export type DokployKey = { id: string; name: string | null; prefix: string | null; createdAt: string | null };

type Row = DokployKey & { start: string | null; key: string | null };

export function dokployKeyHash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("base64url");
}

// The first array called apiKeys anywhere in a response.
function apiKeysIn(v: unknown, depth = 0): Row[] | null {
  if (!v || typeof v !== "object" || depth > 6) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = apiKeysIn(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.apiKeys)) {
    return o.apiKeys
      .filter((k): k is Record<string, unknown> => !!k && typeof k === "object" && typeof (k as { id?: unknown }).id === "string")
      .map((k) => ({
        id: String(k.id),
        name: typeof k.name === "string" ? k.name : null,
        prefix: typeof k.prefix === "string" && k.prefix ? k.prefix : null,
        createdAt: typeof k.createdAt === "string" ? k.createdAt : null,
        start: typeof k.start === "string" && k.start ? k.start : null,
        key: typeof k.key === "string" && k.key ? k.key : null,
      }));
  }
  for (const x of Object.values(o)) {
    const r = apiKeysIn(x, depth + 1);
    if (r) return r;
  }
  return null;
}

export type Match = { id: string } | { none: true } | { pick: DokployKey[] };

// Pure: which of these keys is `plaintext`.
export function matchKey(rows: Row[], plaintext: string): Match {
  const hashed = rows.filter((r) => r.key);
  if (hashed.length > 0) {
    const h = dokployKeyHash(plaintext);
    const hit = hashed.find((r) => r.key === h);
    return hit ? { id: hit.id } : { none: true };
  }
  // No hashes: the longest prefix the key starts with, else its first
  // characters. Keys made for self-hosted installs are never offered.
  const others = rows.filter((r) => !(r.prefix ?? "").startsWith(SELFHOST_KEY_PREFIX.replace(/_$/, "")));
  const byPrefix = others.filter((r) => r.prefix && plaintext.startsWith(r.prefix));
  if (byPrefix.length > 0) {
    const longest = Math.max(...byPrefix.map((r) => r.prefix!.length));
    const best = byPrefix.filter((r) => r.prefix!.length === longest);
    if (best.length === 1) return { id: best[0].id };
    return { pick: best.map(strip) };
  }
  const byStart = others.filter((r) => r.start && plaintext.startsWith(r.start));
  if (byStart.length === 1) return { id: byStart[0].id };
  const list = byStart.length > 0 ? byStart : others;
  return list.length > 0 ? { pick: list.map(strip) } : { none: true };
}

function strip(r: Row): DokployKey {
  return { id: r.id, name: r.name, prefix: r.prefix, createdAt: r.createdAt };
}

async function keysOf(t: Target): Promise<Row[]> {
  try {
    const rows = apiKeysIn(await dokploy(t, "user.getBackups"));
    if (rows && rows.length > 0) return rows;
  } catch (err) {
    if (!(err instanceof InstallError)) throw err;
  }
  return apiKeysIn(await dokploy(t, "user.get")) ?? [];
}

export type DeleteResult = { deleted: true } | { pick: DokployKey[] };

// Delete the key `t` calls with, from its own Dokploy, using itself.
// `picked` is the owner's choice from an earlier { pick } and must still be
// one of their keys.
export async function deleteOwnKey(t: Target, picked?: string): Promise<DeleteResult> {
  const rows = await keysOf(t);
  let id: string;
  if (picked) {
    if (!rows.some((r) => r.id === picked)) throw new InstallError("That key isn't one of your Dokploy keys any more.");
    id = picked;
  } else {
    const m = matchKey(rows, t.apiKey);
    if ("pick" in m) return { pick: m.pick };
    if ("none" in m) throw new InstallError("Zeqqat couldn't find its key among your Dokploy user's keys. It may already be deleted, or belong to another Dokploy user.");
    id = m.id;
  }
  await dokploy(t, "user.deleteApiKey", { apiKeyId: id });
  return { deleted: true };
}
