"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { instance, instanceGrant, oauthClient } from "../../db/schema";
import { requireOwner } from "../guard";
import { newId } from "../id";

const FIELDS = ["allowRead", "allowCreate", "allowEdit", "allowDelete"] as const;
export type GrantField = (typeof FIELDS)[number];

type Grant = Record<GrantField, boolean>;
const DEFAULT_GRANT: Grant = { allowRead: true, allowCreate: true, allowEdit: true, allowDelete: false };

function scopeWhere(workspaceId: string, instanceId: string, oauthClientId: string | null) {
  return and(
    eq(instanceGrant.workspaceId, workspaceId),
    eq(instanceGrant.instanceId, instanceId),
    oauthClientId ? eq(instanceGrant.oauthClientId, oauthClientId) : isNull(instanceGrant.oauthClientId),
  );
}

// Sets one permission for one agent (or the workspace default, when
// oauthClientId is null) on one instance. An agent with no row of its own
// follows the default; its first change copies the default and then
// applies the change, so the other three switches don't jump.
export async function setPermission(instanceId: string, oauthClientId: string | null, field: GrantField, value: boolean) {
  const { ws } = await requireOwner();
  if (!FIELDS.includes(field)) return;

  const inst = await db.query.instance.findFirst({
    where: and(eq(instance.id, instanceId), eq(instance.workspaceId, ws.workspaceId)),
  });
  if (!inst) redirect("/app/permissions");
  if (oauthClientId) {
    const client = await db.query.oauthClient.findFirst({ where: eq(oauthClient.id, oauthClientId) });
    if (!client) return;
  }

  const existing = await db.query.instanceGrant.findFirst({ where: scopeWhere(ws.workspaceId, instanceId, oauthClientId) });
  if (existing) {
    await db
      .update(instanceGrant)
      .set({ [field]: value, updatedAt: new Date() })
      .where(eq(instanceGrant.id, existing.id));
  } else {
    const base = oauthClientId
      ? await db.query.instanceGrant.findFirst({ where: scopeWhere(ws.workspaceId, instanceId, null) })
      : undefined;
    const start: Grant = base
      ? { allowRead: base.allowRead, allowCreate: base.allowCreate, allowEdit: base.allowEdit, allowDelete: base.allowDelete }
      : DEFAULT_GRANT;
    await db.insert(instanceGrant).values({
      id: newId(),
      workspaceId: ws.workspaceId,
      instanceId,
      oauthClientId,
      ...start,
      [field]: value,
    });
  }

  revalidatePath("/app", "layout");
}

// Drops an agent's own row so it follows the workspace default again.
export async function resetPermission(instanceId: string, oauthClientId: string) {
  const { ws } = await requireOwner();
  await db.delete(instanceGrant).where(scopeWhere(ws.workspaceId, instanceId, oauthClientId));
  revalidatePath("/app", "layout");
}
