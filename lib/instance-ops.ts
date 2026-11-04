import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { callLog, instance } from "../db/schema";

// Not a server action on purpose: it takes a workspaceId, so it must only
// be called by code that has already checked the caller owns it.
//
// Deleting the row removes the encrypted key and, by cascade, every grant
// for it. call_log keeps its history: instance_id is a plain reference
// there, so it's cleared first rather than blocking the delete.
export async function deleteInstances(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx
      .update(callLog)
      .set({ instanceId: null })
      .where(and(eq(callLog.workspaceId, workspaceId), inArray(callLog.instanceId, ids)));
    await tx.delete(instance).where(and(eq(instance.workspaceId, workspaceId), inArray(instance.id, ids)));
  });
}
