"use server";

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { apiEndpoint, callLog, instance, oauthClient } from "../../db/schema";
import { toCallView, type CallView } from "../calls";
import { requireOwner } from "../guard";
import { CALL_SELECT } from "../overview";

// Feeds the self-host page's live progress: every call any agent made on
// the chosen instance since the user said they sent the prompt.
export async function callsSince(instanceId: string, sinceIso: string): Promise<CallView[]> {
  const { ws } = await requireOwner();
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return [];
  const rows = await db
    .select(CALL_SELECT)
    .from(callLog)
    .leftJoin(instance, eq(instance.id, callLog.instanceId))
    .leftJoin(oauthClient, eq(oauthClient.id, callLog.oauthClientId))
    .leftJoin(apiEndpoint, eq(apiEndpoint.id, callLog.apiEndpointId))
    .where(and(eq(callLog.workspaceId, ws.workspaceId), eq(callLog.instanceId, instanceId), gte(callLog.createdAt, since)))
    .orderBy(desc(callLog.createdAt))
    .limit(50);
  return rows.map(toCallView);
}
