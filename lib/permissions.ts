import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { instance, instanceGrant, oauthClient, oauthGrant, user } from "../db/schema";

export type Perm = { read: boolean; create: boolean; edit: boolean; delete: boolean };
export type PermCell = { perm: Perm; own: boolean };

const NONE: Perm = { read: false, create: false, edit: false, delete: false };

function toPerm(g: { allowRead: boolean; allowCreate: boolean; allowEdit: boolean; allowDelete: boolean }): Perm {
  return { read: g.allowRead, create: g.allowCreate, edit: g.allowEdit, delete: g.allowDelete };
}

export type ConnectedAgent = {
  oauthClientId: string;
  host: string;
  clientId: string;
  connectedBy: string | null;
  connectedAt: Date;
  lastSeenAt: Date | null;
};

// One row per agent (OAuth client) with a live grant in this workspace.
// Several people can connect the same client; the earliest grant names
// who connected it.
export async function listConnectedAgents(workspaceId: string): Promise<ConnectedAgent[]> {
  const rows = await db
    .select({
      oauthClientId: oauthClient.id,
      host: oauthClient.clientName,
      clientId: oauthClient.clientId,
      lastSeenAt: oauthClient.lastSeenAt,
      connectedAt: oauthGrant.createdAt,
      email: user.email,
    })
    .from(oauthGrant)
    .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.oauthClientId))
    .leftJoin(user, eq(user.id, oauthGrant.userId))
    .where(and(eq(oauthGrant.workspaceId, workspaceId), isNull(oauthGrant.revokedAt)))
    .orderBy(oauthGrant.createdAt);

  const byClient = new Map<string, ConnectedAgent>();
  for (const r of rows) {
    if (byClient.has(r.oauthClientId)) continue;
    byClient.set(r.oauthClientId, {
      oauthClientId: r.oauthClientId,
      host: agentHost(r.clientId, r.host),
      clientId: r.clientId,
      connectedBy: r.email,
      connectedAt: r.connectedAt,
      lastSeenAt: r.lastSeenAt,
    });
  }
  return [...byClient.values()];
}

// Agents are named by the host of their client ID, never by a name they
// chose for themselves. Older rows may carry a non-URL client id.
export function agentHost(clientId: string, fallback: string) {
  try {
    return new URL(clientId).host || fallback;
  } catch {
    return fallback || "Unnamed client";
  }
}

export type InstanceRow = { id: string; alias: string };

// The effective permissions for every (instance, agent) pair, plus the
// workspace default per instance, resolved the same way the executor does:
// an agent's own row wins, otherwise the default applies.
export async function getPermissionMatrix(workspaceId: string) {
  const [instances, grants] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias })
      .from(instance)
      .where(eq(instance.workspaceId, workspaceId))
      .orderBy(instance.createdAt),
    db.select().from(instanceGrant).where(eq(instanceGrant.workspaceId, workspaceId)),
  ]);

  function defaultFor(instanceId: string): Perm {
    const g = grants.find((x) => x.instanceId === instanceId && x.oauthClientId === null);
    return g ? toPerm(g) : NONE;
  }

  function cell(instanceId: string, oauthClientId: string | null): PermCell {
    if (oauthClientId === null) return { perm: defaultFor(instanceId), own: true };
    const g = grants.find((x) => x.instanceId === instanceId && x.oauthClientId === oauthClientId);
    return g ? { perm: toPerm(g), own: true } : { perm: defaultFor(instanceId), own: false };
  }

  return { instances, cell };
}
