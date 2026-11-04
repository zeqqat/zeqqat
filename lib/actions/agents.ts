"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../db";
import { oauthGrant, oauthToken } from "../../db/schema";
import { requireWorkspace } from "../guard";

// Disconnects an agent from this workspace. An owner disconnects it for
// everyone who connected it; a member can only disconnect their own
// connection. Revoking the grant is enough on its own: mcp-auth.ts rejects
// any request whose grant has a revokedAt, so it takes effect on the
// agent's very next call. Tokens are revoked too, for a tidy log.
export async function revokeAgentAction(formData: FormData) {
  const { user, ws } = await requireWorkspace();
  const oauthClientId = formData.get("oauth_client_id")?.toString();
  if (!oauthClientId) return;

  const where = and(
    eq(oauthGrant.workspaceId, ws.workspaceId),
    eq(oauthGrant.oauthClientId, oauthClientId),
    isNull(oauthGrant.revokedAt),
    ...(ws.role === "owner" ? [] : [eq(oauthGrant.userId, user.id)]),
  );
  const grants = await db.select({ id: oauthGrant.id }).from(oauthGrant).where(where);
  const ids = grants.map((g) => g.id);
  if (ids.length === 0) return;

  const now = new Date();
  await db.update(oauthGrant).set({ revokedAt: now }).where(inArray(oauthGrant.id, ids));
  await db.update(oauthToken).set({ revokedAt: now }).where(inArray(oauthToken.grantId, ids));

  revalidatePath("/app", "layout");
}
