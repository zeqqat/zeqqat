import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { instance, selfhostInstall } from "../db/schema";
import { decryptCredential, encryptCredential } from "./crypto";
import { normalizeBaseUrl } from "./dokploy-check";
import { deleteOwnKey, type DokployKey } from "./dokploy-keys";
import { InstallError } from "./selfhost-install";
import { claimHash } from "./selfhost-seed";

// What happens to the key zeqqat.com holds for an instance, once a Zeqqat
// installed from it has its own key and its owner has signed in there.
// Keep it (the default: people staying on zeqqat.com too), or delete it from
// Dokploy (Dokploy can't switch a key off, only delete it). The choice is
// made on the new install, the first thing its owner sees after signing in
// (app/api/selfhost/key), or later in zeqqat.com's Settings. Never before
// the claim: until the owner is in their own Zeqqat, deleting it would cut
// them off.

type Install = typeof selfhostInstall.$inferSelect;
export type CloudKeyResult = { ok: true } | { ok: false; pick: DokployKey[] } | { ok: false; error: string };

export function keyChoiceOpen(row: Pick<Install, "claimedAt" | "ownKey" | "keyChoice" | "instanceId">): boolean {
  return !!row.claimedAt && row.ownKey && !row.keyChoice && !!row.instanceId;
}

export async function installByToken(token: string): Promise<Install | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db.select().from(selfhostInstall).where(eq(selfhostInstall.claimHash, claimHash(token)));
  return row ?? null;
}

export async function applyCloudKeyChoice(row: Install, choice: "kept" | "deleted", picked?: string): Promise<CloudKeyResult> {
  try {
    if (!row.claimedAt) throw new InstallError("Sign in to your own Zeqqat first.");
    if (choice === "kept") {
      await db.update(selfhostInstall).set({ keyChoice: "kept" }).where(eq(selfhostInstall.id, row.id));
      return { ok: true };
    }
    if (!row.instanceId) throw new InstallError("The instance this was installed from is gone from zeqqat.com.");
    if (!row.ownKey) throw new InstallError("Your Zeqqat uses this same key, so deleting it would stop it too.");
    const [inst] = await db
      .select({ id: instance.id, baseUrl: instance.baseUrl, credential: instance.credential, keyDeletedAt: instance.keyDeletedAt })
      .from(instance)
      .where(and(eq(instance.id, row.instanceId), eq(instance.organizationId, row.organizationId)));
    if (!inst) throw new InstallError("The instance this was installed from is gone from zeqqat.com.");
    if (!inst.keyDeletedAt) {
      const baseUrl = normalizeBaseUrl(inst.baseUrl);
      if (!baseUrl) throw new InstallError("This instance's Dokploy URL isn't valid.");
      const r = await deleteOwnKey({ baseUrl, apiKey: decryptCredential(inst.credential) }, picked);
      if ("pick" in r) return { ok: false, pick: r.pick };
      let host = row.address;
      try {
        host = new URL(row.address).host;
      } catch {
        // keep what's saved
      }
      await db
        .update(instance)
        .set({ keyDeletedAt: new Date(), keyDeletedFor: host.slice(0, 200), credential: encryptCredential(""), lastStatus: "key_deleted" })
        .where(eq(instance.id, inst.id));
    }
    await db.update(selfhostInstall).set({ keyChoice: "deleted" }).where(eq(selfhostInstall.id, row.id));
    return { ok: true };
  } catch (err) {
    if (err instanceof InstallError) return { ok: false, error: err.message };
    throw err;
  }
}
