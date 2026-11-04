import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { oauthGrant, oauthToken, organization, workspace } from "../db/schema";
import type { CallerRole } from "./connections";
import { sha256Hex } from "./oauth-crypto";
import { workspaceRoleFor } from "./workspace";

export type AccountType = "personal" | "organization";

// organization.kind is 'personal' | 'organization'; anything else is a bug,
// and reading it as an organization is the safer guess (it never claims a
// single owner who isn't one).
export function accountType(kind: string): AccountType {
  return kind === "personal" ? "personal" : "organization";
}

export type McpContext = {
  organizationId: string;
  workspaceId: string;
  organizationSlug: string;
  // The owning account's type, shown to the model as context.account.type.
  organizationKind: AccountType;
  workspaceName: string;
  oauthClientId: string | null;
  userId: string | null;
  // The connection URL the call came in on (/<org>/mcp/<name>/<id>). Every
  // call has one: the bare /mcp endpoint is retired.
  connectionId: string;
  // The connection's name, shown to the model in the context. Set by the
  // route from the URL's connection row.
  connectionName?: string | null;
  callerRole: CallerRole;
  // Set during a sunset's warning period: the replacement URL and cutoff,
  // carried in the server's instructions and on every result.
  notice?: string | null;
  // Per tools/call, set by lib/mcp-server.ts: the agent's reason and the
  // request it groups into (lib/requests.ts). Every log row carries both.
  reason?: string | null;
  requestId?: string | null;
};

// `expect` is the connection the URL named. A token is only valid on the
// URL it was issued for: a token from a "deployment" connection can't be
// replayed against a "social" one (naming doc v2, section 9).
export async function resolveBearerToken(
  request: Request,
  expect: { connectionId: string; workspaceId: string },
): Promise<McpContext | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const raw = auth.slice("Bearer ".length).trim();
  if (!raw) return null;

  const tokenHash = sha256Hex(raw);
  const tokenRow = await db.query.oauthToken.findFirst({
    where: and(eq(oauthToken.tokenHash, tokenHash), eq(oauthToken.kind, "access"), isNull(oauthToken.revokedAt)),
  });
  if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) return null;

  const grant = await db.query.oauthGrant.findFirst({ where: eq(oauthGrant.id, tokenRow.grantId) });
  if (!grant || grant.revokedAt) return null;

  const wanted = expect.connectionId;
  if (!grant.connectionId || grant.connectionId !== wanted || grant.workspaceId !== expect.workspaceId) return null;

  const [org, ws] = await Promise.all([
    db.query.organization.findFirst({ where: eq(organization.id, grant.organizationId) }),
    db.query.workspace.findFirst({ where: eq(workspace.id, grant.workspaceId) }),
  ]);
  if (!org || !ws) return null;

  // On a connection URL the caller's current workspace role is looked up on
  // every request, so removing someone from the workspace (or demoting
  // them) takes effect immediately, not at token expiry.
  if (!grant.userId) return null;
  const callerRole: CallerRole | null = await workspaceRoleFor(grant.userId, grant.workspaceId);
  if (!callerRole) return null;

  return {
    organizationId: grant.organizationId,
    workspaceId: grant.workspaceId,
    organizationSlug: org.slug,
    organizationKind: accountType(org.kind),
    workspaceName: ws.name,
    oauthClientId: grant.oauthClientId,
    userId: grant.userId,
    connectionId: wanted,
    callerRole,
  };
}
