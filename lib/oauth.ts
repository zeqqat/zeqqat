import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  oauthAuthorizationCode,
  oauthClient,
  oauthGrant,
  oauthToken,
  user as userTable,
  workspace as workspaceTable,
} from "../db/schema";
import { findConnectionByPath, parseConnectionPath } from "./connections";
import { publicUrl } from "./env";
import { newId } from "./id";
import { pkceS256, randomToken, sha256Hex, timingSafeEqual } from "./oauth-crypto";

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 60 * 1000; // 60 seconds

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function loopbackRedirect(uri: string): URL | null {
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:") return null;
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]" || u.hostname === "::1") {
      return u;
    }
    return null;
  } catch {
    return null;
  }
}

export function validateRedirectUri(client: { redirectUris: string[] }, redirectUri: string): boolean {
  // Exact, full-string match — no prefix matching, no wildcards (spec
  // section 7).
  if (client.redirectUris.includes(redirectUri)) return true;

  // RFC 8252 §7.3: a native client (Claude Code) binds an ephemeral
  // loopback port at runtime, so its CIMD document can't name an exact
  // port ahead of time. Match host and path with the port ignored, and
  // only for loopback addresses — this exception doesn't apply anywhere
  // else.
  const candidate = loopbackRedirect(redirectUri);
  if (!candidate) return false;
  return client.redirectUris.some((registered) => {
    const reg = loopbackRedirect(registered);
    return reg !== null && reg.hostname === candidate.hostname && reg.pathname === candidate.pathname;
  });
}

// A small, deliberately non-exhaustive blocklist — the same tradeoff
// executor.ts makes for instance.baseUrl, except client_id here really is
// attacker-reachable: it's an unauthenticated query parameter on a public
// page, so anyone on the internet can make this server fetch whatever URL
// they name. This blocks the obvious targets (cloud metadata, loopback,
// private ranges by literal IP) but does not defend against DNS rebinding,
// where an attacker's own domain resolves to a blocked address only after
// this check runs.
const CIMD_BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal", "localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function isPrivateIpLiteral(hostname: string): boolean {
  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127 || (a === 169 && b === 254);
  }
  return hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80");
}

type CimdDocument = { client_id: string; redirect_uris: string[] };

async function fetchCimdDocument(url: string): Promise<CimdDocument | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // CIMD requires https (RFC draft — a client_id an attacker could serve
  // over plain http is not a meaningful identity claim).
  if (parsed.protocol !== "https:") return null;
  if (CIMD_BLOCKED_HOSTS.has(parsed.hostname) || isPrivateIpLiteral(parsed.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const doc = await res.json();
    // Self-referential check: the document's own client_id must equal the
    // URL it was served from, or anyone could point at someone else's
    // metadata and borrow their identity.
    if (doc?.client_id !== url) return null;
    if (!Array.isArray(doc?.redirect_uris) || doc.redirect_uris.length === 0) return null;
    if (!doc.redirect_uris.every((u: unknown) => typeof u === "string")) return null;
    return { client_id: url, redirect_uris: doc.redirect_uris };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// A client_id that's an https:// URL is a Client ID Metadata Document
// (CIMD) reference, not a value we ever issued — there's no registration
// step to have skipped. Re-fetched and re-validated on every authorize
// request rather than trusted from the DB alone, since the document lives
// on infrastructure we don't control and its redirect_uris can change.
export async function getClientByClientId(clientId: string) {
  const existing = await db.query.oauthClient.findFirst({ where: eq(oauthClient.clientId, clientId) });

  if (!clientId.startsWith("https://")) return existing ?? null;

  const doc = await fetchCimdDocument(clientId);
  if (!doc) return existing ?? null; // fetch/validation failed — fall back to what's on file, if anything

  // Never display the document's own client_name (self-asserted, so
  // meaningless as an identity claim) — the host of the client_id URL is
  // the actual relying party.
  const clientName = new URL(clientId).host;

  if (existing) {
    const [updated] = await db
      .update(oauthClient)
      .set({ redirectUris: doc.redirect_uris, clientName, lastSeenAt: new Date() })
      .where(eq(oauthClient.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(oauthClient)
    .values({ id: newId(), clientId, clientName, redirectUris: doc.redirect_uris })
    .returning();
  return created;
}

export async function createAuthorizationCode(params: {
  oauthClientId: string;
  userId: string;
  workspaceId: string;
  connectionId?: string | null;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}) {
  const raw = randomToken();
  await db.insert(oauthAuthorizationCode).values({
    id: newId(),
    codeHash: sha256Hex(raw),
    oauthClientId: params.oauthClientId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    connectionId: params.connectionId ?? null,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: "S256",
    scope: params.scope,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return raw;
}

async function getOrCreateGrant(params: {
  oauthClientId: string;
  userId: string;
  organizationId: string;
  workspaceId: string;
  connectionId: string | null;
  scope: string;
}) {
  // One grant per (agent, person, workspace, connection URL).
  const existing = await db.query.oauthGrant.findFirst({
    where: and(
      eq(oauthGrant.oauthClientId, params.oauthClientId),
      eq(oauthGrant.userId, params.userId),
      eq(oauthGrant.workspaceId, params.workspaceId),
      params.connectionId ? eq(oauthGrant.connectionId, params.connectionId) : isNull(oauthGrant.connectionId),
      isNull(oauthGrant.revokedAt),
    ),
  });
  if (existing) return existing;

  const id = newId();
  await db.insert(oauthGrant).values({
    id,
    oauthClientId: params.oauthClientId,
    userId: params.userId,
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    connectionId: params.connectionId,
    scope: params.scope,
  });
  return { id };
}

async function issueTokenPair(grantId: string) {
  const accessRaw = randomToken();
  const refreshRaw = randomToken();
  const now = Date.now();

  await db.insert(oauthToken).values([
    {
      id: newId(),
      grantId,
      kind: "access",
      tokenHash: sha256Hex(accessRaw),
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    },
    {
      id: newId(),
      grantId,
      kind: "refresh",
      tokenHash: sha256Hex(refreshRaw),
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  ]);

  return {
    access_token: accessRaw,
    refresh_token: refreshRaw,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
  };
}

// POST /oauth/token, grant_type=authorization_code.
export async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string | null;
}) {
  const codeHash = sha256Hex(params.code);
  const row = await db.query.oauthAuthorizationCode.findFirst({
    where: eq(oauthAuthorizationCode.codeHash, codeHash),
  });

  // Delete-on-read: whether this exchange succeeds or fails past this
  // point, the code must not be usable again (spec section 7: "single
  // use... deleted on exchange").
  if (row) {
    await db.delete(oauthAuthorizationCode).where(eq(oauthAuthorizationCode.id, row.id));
  }

  if (!row) throw new OAuthError("invalid_grant", "Unknown or already-used authorization code");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "Authorization code expired");
  }

  const client = await db.query.oauthClient.findFirst({ where: eq(oauthClient.id, row.oauthClientId) });
  if (!client || client.clientId !== params.clientId) {
    throw new OAuthError("invalid_grant", "Client does not match the authorization code");
  }
  if (row.redirectUri !== params.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (!timingSafeEqual(pkceS256(params.codeVerifier), row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  // Every token is for exactly one connection URL (naming doc v2, section
  // 9). A code without one could only come from the retired bare /mcp.
  if (!row.connectionId) {
    throw new OAuthError("invalid_grant", "This authorization isn't for a connection URL");
  }
  // RFC 8707: when the client repeats `resource` here it must still name
  // the connection the code was issued for.
  if (params.resource) {
    const conn = await connectionFromResource(params.resource);
    if (!conn || conn.id !== row.connectionId) {
      throw new OAuthError("invalid_target", "resource doesn't match the authorization request");
    }
  }

  const user = await db.query.user.findFirst({ where: eq(userTable.id, row.userId) });
  const workspace = await db.query.workspace.findFirst({ where: eq(workspaceTable.id, row.workspaceId) });
  if (!user || !workspace) {
    throw new OAuthError("invalid_grant", "The user or workspace behind this code no longer exists");
  }

  const grant = await getOrCreateGrant({
    oauthClientId: client.id,
    userId: row.userId,
    organizationId: workspace.organizationId,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId ?? null,
    scope: row.scope,
  });

  const tokens = await issueTokenPair(grant.id);
  return { ...tokens, scope: row.scope };
}

// POST /oauth/token, grant_type=refresh_token. Rotating: the old refresh
// token is revoked as soon as it's used, regardless of what happens next.
export async function refreshAccessToken(params: { refreshToken: string; clientId: string }) {
  const tokenHash = sha256Hex(params.refreshToken);
  const tokenRow = await db.query.oauthToken.findFirst({
    where: and(eq(oauthToken.tokenHash, tokenHash), eq(oauthToken.kind, "refresh")),
  });
  if (!tokenRow) throw new OAuthError("invalid_grant", "Unknown refresh token");

  await db
    .update(oauthToken)
    .set({ revokedAt: new Date() })
    .where(eq(oauthToken.id, tokenRow.id));

  if (tokenRow.revokedAt) throw new OAuthError("invalid_grant", "Refresh token already used or revoked");
  if (tokenRow.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Refresh token expired");

  const grant = await db.query.oauthGrant.findFirst({ where: eq(oauthGrant.id, tokenRow.grantId) });
  if (!grant || grant.revokedAt) throw new OAuthError("invalid_grant", "Grant has been revoked");

  const client = await db.query.oauthClient.findFirst({ where: eq(oauthClient.id, grant.oauthClientId) });
  if (!client || client.clientId !== params.clientId) {
    throw new OAuthError("invalid_grant", "Client does not match this refresh token");
  }

  const tokens = await issueTokenPair(grant.id);
  return { ...tokens, scope: grant.scope };
}

// POST /oauth/revoke (RFC 7009): always succeeds from the caller's point of
// view, whether or not the token existed, to avoid leaking which tokens
// are valid.
export async function revokeToken(token: string) {
  const tokenHash = sha256Hex(token);
  await db
    .update(oauthToken)
    .set({ revokedAt: new Date() })
    .where(eq(oauthToken.tokenHash, tokenHash));
}

// RFC 8707: the `resource` a client asks a token for. When it names one of
// our connection URLs, the sign-in is for that connection.
export async function connectionFromResource(resource: string | undefined | null) {
  if (!resource) return null;
  let path: string;
  try {
    const u = new URL(resource);
    if (u.origin !== new URL(publicUrl()).origin) return null;
    path = u.pathname;
  } catch {
    return null;
  }
  const p = parseConnectionPath(path);
  if (!p) return null;
  return findConnectionByPath(p.org, p.name, p.shortId);
}
