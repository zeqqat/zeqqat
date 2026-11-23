"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { cloudHandoff } from "../../db/schema";
import { decryptCredential } from "../crypto";
import type { DokployKey } from "../dokploy-keys";
import { requireUser } from "../guard";

export type HandoffResult = { ok: true } | { ok: false; pick: DokployKey[] } | { ok: false; error: string };

// Keep or delete zeqqat.com's key (lib/cloud-handoff.ts). zeqqat.com does
// the work with its own key; this install only passes the owner's choice
// along with the claim token.
export async function answerCloudKey(handoffId: string, choice: "kept" | "deleted", picked?: string): Promise<HandoffResult> {
  const me = await requireUser();
  const [row] = await db
    .select()
    .from(cloudHandoff)
    .where(and(eq(cloudHandoff.id, handoffId), eq(cloudHandoff.ownerUserId, me.id), isNull(cloudHandoff.choice)));
  if (!row) return { ok: false, error: "Already answered." };
  let res: Response;
  try {
    res = await fetch(new URL("/api/selfhost/key", row.report), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: decryptCredential(row.claimToken), choice, picked }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, error: `Couldn't reach ${row.cloudHost}. Try again in a moment.` };
  }
  if (res.status === 404) {
    // zeqqat.com doesn't know this install any more: nothing to keep.
    await db.update(cloudHandoff).set({ choice: "gone" }).where(eq(cloudHandoff.id, row.id));
    return { ok: true };
  }
  const body = (await res.json().catch(() => null)) as HandoffResult | { ok: true; already: string } | null;
  if (!body) return { ok: false, error: `${row.cloudHost} didn't answer. Try again in a moment.` };
  if (body.ok) {
    await db.update(cloudHandoff).set({ choice }).where(eq(cloudHandoff.id, row.id));
    return { ok: true };
  }
  return body;
}
