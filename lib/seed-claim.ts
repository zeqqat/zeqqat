import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { instance, integration, organization, user, workspace } from "../db/schema";
import { decryptCredential } from "./crypto";
import { normalizeBaseUrl } from "./dokploy-check";
import { edition } from "./edition";
import { newId } from "./id";
import { giveInstance } from "./instance-ops";
import { syncOfficialCatalog } from "./official-catalog";
import { dokploy, findDeep } from "./selfhost-install";
import { claimMatches, decodeSeed, SEED_ENV, withoutSeed, type Seed } from "./selfhost-seed";
import { isReserved, isValidOrgSlug } from "./username";
import { isReservedWorkspaceSlug } from "./paths";

// The self-hosted side of the handoff from zeqqat.com (lib/selfhost-seed.ts).
// While the install has no users and carries a seed, its owner account can
// only be made from the claim link; making it brings in the account's
// username, its workspace(s) and the Dokploy instance, so Setup opens at
// "Connect your agent". Once anyone exists, the seed is ignored for good.

export function currentSeed(): Seed | null {
  if (edition() === "cloud") return null;
  return decodeSeed(process.env[SEED_ENV]);
}

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  return row?.n ?? 0;
}

// True while the install waits to be claimed from zeqqat.com.
export async function awaitingClaim(): Promise<Seed | null> {
  const seed = currentSeed();
  if (!seed) return null;
  return (await userCount()) === 0 ? seed : null;
}

export function claimAllowed(seed: Seed, email: string, token: string | null): boolean {
  return claimMatches(seed, token) && seed.owner.email.trim().toLowerCase() === email.trim().toLowerCase();
}

// Right after the owner account is created (lib/auth.ts): their username,
// the instance and the workspace(s). Then, in the background, take the
// seed out of the compose's environment in Dokploy.
export async function applySeed(seed: Seed, userId: string, token: string): Promise<void> {
  // Only for the install's very first account.
  if ((await userCount()) !== 1) return;
  const [own] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.ownerUserId, userId), eq(organization.kind, "personal")))
    .limit(1);
  if (!own) return;

  const findDokploy = () => db.query.integration.findFirst({ where: and(eq(integration.slug, "dokploy"), eq(integration.official, true)) });
  let dokployApp = await findDokploy();
  if (!dokployApp) {
    await syncOfficialCatalog().catch((err) => console.error("[zeqqat] official catalog sync failed:", err));
    dokployApp = await findDokploy();
  }

  await db.transaction(async (tx) => {
    const wanted = seed.owner.username;
    if (isValidOrgSlug(wanted) && !isReserved(wanted)) {
      const [taken] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.slug, wanted)).limit(1);
      if (!taken) await tx.update(organization).set({ slug: wanted, displayName: wanted }).where(eq(organization.id, own.id));
    }
    if (!dokployApp) return;
    const instanceId = newId();
    await tx.insert(instance).values({
      id: instanceId,
      organizationId: own.id,
      integrationId: dokployApp.id,
      alias: seed.instance.alias,
      baseUrl: seed.instance.baseUrl,
      credential: seed.instance.credential,
      keyHint: seed.instance.keyHint,
      lastVersion: seed.instance.lastVersion,
      createdByUserId: userId,
    });
    const used = new Set<string>();
    for (const w of seed.workspaces) {
      let slug = w.slug;
      if (!slug || isReservedWorkspaceSlug(slug)) continue;
      let k = 2;
      while (used.has(slug)) slug = `${w.slug}-${k++}`;
      used.add(slug);
      const id = newId();
      await tx.insert(workspace).values({ id, organizationId: own.id, slug, name: (w.name || slug).slice(0, 60), setupCompletedAt: null });
      await giveInstance(tx, id, instanceId);
    }
  });

  void stripSeed(seed).catch((err) => console.error("[zeqqat] couldn't remove the seed from Dokploy:", err));
  void reportClaim(seed, token);
}

// Tell zeqqat.com the owner account exists (app/api/selfhost/claimed there).
// Only the claim token goes; a few tries, then it gives up quietly (the link
// on zeqqat.com can't make a second account anyway).
async function reportClaim(seed: Seed, token: string) {
  if (!seed.report) return;
  let url: URL;
  try {
    url = new URL("/api/selfhost/claimed", seed.report);
  } catch {
    return;
  }
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
    } catch {
      // try again
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
}

// The seed has done its job: remove ZEQQAT_SEED from this install's compose
// in Dokploy (it takes effect on the next deploy; until then it is ignored
// anyway, since the install has an owner).
async function stripSeed(seed: Seed) {
  const baseUrl = normalizeBaseUrl(seed.instance.baseUrl);
  if (!baseUrl || !seed.composeId) return;
  const t = { baseUrl, apiKey: decryptCredential(seed.instance.credential) };
  const one = await dokploy(t, "compose.one", undefined, { composeId: seed.composeId });
  const env = findDeep(one, "env");
  if (typeof env !== "string" || !env.includes(SEED_ENV)) return;
  await dokploy(t, "compose.update", { composeId: seed.composeId, env: withoutSeed(env) });
}
