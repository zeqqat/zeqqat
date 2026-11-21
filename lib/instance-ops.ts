import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { callLog, connectionGrant, connection, instance, instanceGrant, workspaceInstance } from "../db/schema";
import { addInstanceToPrimaryConnection, type Tx } from "./connections";
import { newId } from "./id";

// Not a server action on purpose: it takes an organizationId, so it must
// only be called by code that has already checked the caller owns it.
//
// Deleting the row removes the encrypted key and, by cascade, every grant
// for it. call_log keeps its history: instance_id is a plain reference
// there, so it's cleared first rather than blocking the delete.
export async function deleteInstances(organizationId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.update(callLog).set({ instanceId: null }).where(inArray(callLog.instanceId, ids));
    await tx.delete(instance).where(and(eq(instance.organizationId, organizationId), inArray(instance.id, ids)));
  });
}

// Lets a workspace use one of its account's instances: the workspace row,
// the workspace-default grant (read, create, edit; delete off) and a place
// on the workspace's first MCP URL, so the URL already pasted into an
// agent picks it up.
export async function giveInstance(tx: Tx | typeof db, workspaceId: string, instanceId: string) {
  await tx.insert(workspaceInstance).values({ workspaceId, instanceId }).onConflictDoNothing();
  await tx.insert(instanceGrant).values({ id: newId(), workspaceId, instanceId, oauthClientId: null }).onConflictDoNothing();
  await addInstanceToPrimaryConnection(workspaceId, instanceId, tx);
}

// The reverse: the workspace can no longer reach the instance, through any
// of its MCP URLs.
export async function takeInstance(tx: Tx | typeof db, workspaceId: string, instanceId: string) {
  await tx.delete(workspaceInstance).where(and(eq(workspaceInstance.workspaceId, workspaceId), eq(workspaceInstance.instanceId, instanceId)));
  await tx.delete(instanceGrant).where(and(eq(instanceGrant.workspaceId, workspaceId), eq(instanceGrant.instanceId, instanceId)));
  const urls = await tx.select({ id: connection.id }).from(connection).where(eq(connection.workspaceId, workspaceId));
  if (urls.length) {
    await tx
      .delete(connectionGrant)
      .where(and(eq(connectionGrant.instanceId, instanceId), inArray(connectionGrant.connectionId, urls.map((u) => u.id))));
  }
}
