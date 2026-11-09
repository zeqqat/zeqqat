"use server";

import { db } from "../../db";
import { devToolsEnabled } from "../dev-tools";
import { pastUsersOf, restoreUser, retireUser } from "../dev-users";
import { requireUser } from "../guard";

// Dev tools only (lib/dev-tools.ts). The client signs out right after
// either action, then lands on the sign-in page.

export async function startOverAction(): Promise<{ ok: boolean }> {
  if (!devToolsEnabled()) return { ok: false };
  const me = await requireUser();
  await db.transaction((tx) => retireUser(tx, me.id));
  return { ok: true };
}

// Go back to an earlier user of the same person: the current user is
// retired and the earlier one gets its email and sign-in links back.
export async function switchToPastUserAction(targetId: string): Promise<{ ok: boolean }> {
  if (!devToolsEnabled()) return { ok: false };
  const me = await requireUser();
  const past = await pastUsersOf(me);
  if (!past.some((p) => p.id === targetId)) return { ok: false };
  try {
    await db.transaction(async (tx) => {
      await retireUser(tx, me.id);
      await restoreUser(tx, targetId);
    });
    return { ok: true };
  } catch (err) {
    console.error("[zeqqat] dev tools: switching user failed:", err);
    return { ok: false };
  }
}
