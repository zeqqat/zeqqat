import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { instance, selfhostInstall } from "../db/schema";
import { decryptCredential } from "./crypto";
import { claimHash } from "./selfhost-seed";

// The Zeqqats an account installed from zeqqat.com (db/schema.ts
// selfhost_install). The claim link stays until the new install reports
// its owner account was made (app/api/selfhost/claimed); the account menu
// shows Self-host until 7 days after that, then it lives in Settings.

export const SELF_HOST_MENU_DAYS = 7;

export type SavedInstall = {
  id: string;
  address: string;
  instanceId: string | null;
  instanceAlias: string | null;
  keyHint: { start: string; end: string } | null;
  keyDeletedAt: Date | null;
  ownKey: boolean;
  keyChoice: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  // Only while nobody has claimed it.
  claimUrl: string | null;
  claimToken: string | null;
  composeId: string;
};

export async function installsOf(organizationId: string): Promise<SavedInstall[]> {
  const rows = await db
    .select({
      id: selfhostInstall.id,
      address: selfhostInstall.address,
      instanceId: selfhostInstall.instanceId,
      instanceAlias: instance.alias,
      keyHint: instance.keyHint,
      keyDeletedAt: instance.keyDeletedAt,
      ownKey: selfhostInstall.ownKey,
      keyChoice: selfhostInstall.keyChoice,
      createdAt: selfhostInstall.createdAt,
      claimedAt: selfhostInstall.claimedAt,
      claimToken: selfhostInstall.claimToken,
      composeId: selfhostInstall.composeId,
    })
    .from(selfhostInstall)
    .leftJoin(instance, eq(instance.id, selfhostInstall.instanceId))
    .where(eq(selfhostInstall.organizationId, organizationId))
    .orderBy(desc(selfhostInstall.createdAt));
  return rows.map(({ claimToken, ...r }) => {
    let claimUrl: string | null = null;
    let token: string | null = null;
    if (!r.claimedAt) {
      try {
        token = decryptCredential(claimToken);
        claimUrl = `${r.address}/claim/${token}`;
      } catch {
        claimUrl = null;
      }
    }
    return { ...r, claimUrl, claimToken: token };
  });
}

// Still worth a place in the menu: not claimed yet, or claimed recently.
export function isRecent(i: { claimedAt: Date | null }, now = Date.now()): boolean {
  return !i.claimedAt || now - i.claimedAt.getTime() < SELF_HOST_MENU_DAYS * 86_400_000;
}

export async function showSelfHostMenu(organizationId: string): Promise<boolean> {
  const rows = await db
    .select({ claimedAt: selfhostInstall.claimedAt })
    .from(selfhostInstall)
    .where(eq(selfhostInstall.organizationId, organizationId));
  return rows.some((r) => isRecent(r));
}

// The new install says its owner account exists. Unknown or used tokens
// change nothing (and the caller can't tell).
export async function recordClaim(token: string): Promise<void> {
  if (!token || token.length > 200) return;
  await db
    .update(selfhostInstall)
    .set({ claimedAt: new Date() })
    .where(and(eq(selfhostInstall.claimHash, claimHash(token)), isNull(selfhostInstall.claimedAt)));
}
