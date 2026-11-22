import { createHash, timingSafeEqual } from "node:crypto";
import type { EncryptedCredential } from "./crypto";

// The handoff from zeqqat.com to a Zeqqat it installs in someone's Dokploy.
// The cloud writes it into the new install's environment as ZEQQAT_SEED, so
// the person isn't asked to set up again: their account (email, name,
// username), the workspace(s) using the instance it was installed from, and
// that instance with a new Dokploy key made just for this install. Nothing
// else comes along: MCP URLs are new URLs and get made there, policies stay
// on zeqqat.com, and nothing on zeqqat.com is moved or deleted.
//
// The key is encrypted with the new install's own ZEQQAT_ENCRYPTION_KEY,
// so it never sits readable in Dokploy. The owner account can only be
// created with the claim token from zeqqat.com's "Open your Zeqqat" link
// (only its SHA-256 is in the seed): nobody who stumbles on the fresh
// sslip.io address first can take the install.

export type SeedInstance = {
  alias: string;
  baseUrl: string;
  credential: EncryptedCredential;
  keyHint: { start: string; end: string };
  lastVersion: string | null;
};

export type Seed = {
  v: 1;
  claim: string; // sha256 hex of the claim token
  owner: { email: string; name: string; username: string };
  instance: SeedInstance;
  workspaces: { slug: string; name: string }[];
  // The compose this install runs as, on that instance's Dokploy: after the
  // claim the install removes ZEQQAT_SEED from it.
  composeId: string;
  // zeqqat.com's address: after the claim the install tells it, with only
  // the claim token, so it stops showing the claim link.
  report?: string;
};

export const SEED_ENV = "ZEQQAT_SEED";
export const CLAIM_HEADER = "x-zeqqat-claim";

export function encodeSeed(seed: Seed): string {
  return Buffer.from(JSON.stringify(seed), "utf8").toString("base64url");
}

export function decodeSeed(raw: string | undefined | null): Seed | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw.trim(), "base64url").toString("utf8")) as Seed;
    if (s?.v !== 1 || typeof s.claim !== "string" || !s.owner?.email || !s.instance?.baseUrl) return null;
    return s;
  } catch {
    return null;
  }
}

export function claimHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function claimMatches(seed: Seed, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(claimHash(token), "hex");
  const b = Buffer.from(seed.claim, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// The env block without the seed line (and nothing else changed).
export function withoutSeed(env: string): string {
  return env
    .split("\n")
    .filter((l) => !new RegExp(`^\\s*${SEED_ENV}\\s*=`).test(l))
    .join("\n");
}
