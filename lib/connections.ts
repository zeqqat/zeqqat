import { randomBytes } from "crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { connection, connectionAlias, connectionGrant, instance, integration, oauthGrant, organization, user } from "../db/schema";
import { CONNECTION_PATH, parseConnectionPath } from "./connection-paths";
import { publicUrl } from "./env";
import { newId } from "./id";
import type { WsRole } from "./workspace";

export type Perm = { read: boolean; create: boolean; edit: boolean; delete: boolean };
export type Kind = keyof Perm;
export type CallerRole = WsRole | "public";

// What each role may ever do, before the connection's own policy is applied.
// Public callers run on the workspace's credentials with no identity, so
// they are held to read no matter what a connection's policy says.
export const ROLE_CAP: Record<CallerRole, Perm> = {
  admin: { read: true, create: true, edit: true, delete: true },
  member: { read: true, create: true, edit: true, delete: false },
  viewer: { read: true, create: false, edit: false, delete: false },
  public: { read: true, create: false, edit: false, delete: false },
};

export const NONE: Perm = { read: false, create: false, edit: false, delete: false };

export function intersect(a: Perm, b: Perm): Perm {
  return { read: a.read && b.read, create: a.create && b.create, edit: a.edit && b.edit, delete: a.delete && b.delete };
}

export function grantToPerm(g: { allowRead: boolean; allowCreate: boolean; allowEdit: boolean; allowDelete: boolean }): Perm {
  return { read: g.allowRead, create: g.allowCreate, edit: g.allowEdit, delete: g.allowDelete };
}

// snake_case, so the name can sit inside wire-safe identifiers later and
// never collides with the `-` segment separator. Names say what a
// connection is for ("deployment", "social"); they are not unique, the
// short id tells same-named connections apart.
export const CONNECTION_NAME = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export function toConnectionName(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
}

const SHORT_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newShortId(length = 4) {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += SHORT_ALPHABET[b % SHORT_ALPHABET.length];
  return out;
}

// Naming doc v2, section 6: zeqqat.com/<org>/mcp/<name>/<shortId>. The org
// comes first, like every page URL; `mcp` marks it as a connection.
export function connectionPath(orgSlug: string, name: string, shortId: string) {
  return `/${orgSlug}/mcp/${name}/${shortId}`;
}

export function connectionUrl(orgSlug: string, name: string, shortId: string) {
  return `${publicUrl()}${connectionPath(orgSlug, name, shortId)}`;
}

// Naming doc v2, section 9: one protected resource document per
// connection, at the well-known path with the connection path appended.
export function resourceMetadataUrl(path: string) {
  return `${publicUrl()}/.well-known/oauth-protected-resource${path.replace(/\/$/, "")}`;
}

export { CONNECTION_PATH, parseConnectionPath };

// `movedTo` is set when the row was found through an old URL (its
// workspace moved to another namespace): `url` stays the URL that was
// asked for, so OAuth resources keep matching, and `movedTo` is the new one.
export type ConnectionRow = typeof connection.$inferSelect & { orgSlug: string; url: string; movedTo?: string | null };

function toRow(r: { c: typeof connection.$inferSelect; orgSlug: string }): ConnectionRow {
  return { ...r.c, orgSlug: r.orgSlug, url: connectionUrl(r.orgSlug, r.c.name, r.c.shortId) };
}

// Deleted connections are invisible everywhere: their URL behaves exactly
// like one that never existed.
export async function findConnectionByPath(orgSlug: string, name: string, shortId: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(connection.name, name),
        eq(connection.shortId, shortId),
        isNull(connection.deletedAt),
      ),
    )
    .limit(1);
  if (row) return toRow(row);
  // An old URL of a connection whose workspace was transferred.
  const [moved] = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connectionAlias)
    .innerJoin(organization, eq(organization.id, connectionAlias.organizationId))
    .innerJoin(connection, eq(connection.id, connectionAlias.connectionId))
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(connectionAlias.name, name),
        eq(connectionAlias.shortId, shortId),
        isNull(connection.deletedAt),
      ),
    )
    .limit(1);
  if (!moved) return null;
  const current = await getConnectionById(moved.c.id);
  // orgSlug is the namespace the connection belongs to now; url is the old
  // URL that was asked for.
  return { ...moved.c, orgSlug: current?.orgSlug ?? orgSlug, url: connectionUrl(orgSlug, name, shortId), movedTo: current?.url ?? null };
}

// The notice for a connection reached through an old URL.
export function movedNotice(conn: ConnectionRow): string {
  return conn.movedTo
    ? `This Zeqqat connection (${conn.name}) moved to a new URL: ${conn.movedTo}. The old URL keeps working for now; tell the user to update the connector.`
    : "";
}

export async function getConnection(workspaceId: string, id: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(and(eq(connection.id, id), eq(connection.workspaceId, workspaceId), isNull(connection.deletedAt)))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function getConnectionById(id: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(and(eq(connection.id, id), isNull(connection.deletedAt)))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function listConnections(workspaceId: string): Promise<ConnectionRow[]> {
  const rows = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(and(eq(connection.workspaceId, workspaceId), isNull(connection.deletedAt)))
    .orderBy(asc(connection.createdAt));
  return rows.map(toRow);
}

// ---------- Sunsetting (naming doc v2, section 6) ----------
// live:    not being sunset.
// warning: a cutoff is set and still ahead. Everything works; the server's
//          instructions and every result carry the new URL and the date.
// cutoff:  the cutoff has passed. Connecting still works so the model can
//          explain, but no tools are listed.
export type SunsetState = "live" | "warning" | "cutoff";

export function sunsetState(conn: { sunsetAt: Date | null }, now = new Date()): SunsetState {
  if (!conn.sunsetAt) return "live";
  return conn.sunsetAt.getTime() > now.getTime() ? "warning" : "cutoff";
}

export function formatCutoff(d: Date) {
  return d.toISOString().slice(0, 10);
}

// The message a client sees during the warning period and after the
// cutoff. Points at the replacement's URL when there is one.
export async function sunsetNotice(conn: ConnectionRow, now = new Date()): Promise<{ state: SunsetState; text: string; replacementUrl: string | null }> {
  const state = sunsetState(conn, now);
  if (state === "live") return { state, text: "", replacementUrl: null };
  const replacement = conn.replacedByConnectionId ? await getConnectionById(conn.replacedByConnectionId) : null;
  const replacementUrl = replacement && sunsetState(replacement, now) !== "cutoff" ? replacement.url : null;
  const date = formatCutoff(conn.sunsetAt!);
  const where = replacementUrl ? ` Use the new URL instead: ${replacementUrl}` : " Ask your workspace admin for its replacement.";
  const custom = conn.sunsetMessage ? ` ${conn.sunsetMessage}` : "";
  const text =
    state === "warning"
      ? `This Zeqqat connection (${conn.name}) is being retired on ${date}. It keeps working until then.${where}${custom}`
      : `This Zeqqat connection (${conn.name}) was retired on ${date} and no longer serves tools.${where}${custom}`;
  return { state, text, replacementUrl };
}

// Per-instance policy rows for one connection, with every workspace
// instance listed (instances without a row are unreachable through it).
export async function getConnectionPolicy(connectionId: string, workspaceId: string) {
  const [instances, grants] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias, integrationName: integration.name, integrationSlug: integration.slug })
      .from(instance)
      .innerJoin(integration, eq(integration.id, instance.integrationId))
      .where(eq(instance.workspaceId, workspaceId))
      .orderBy(asc(instance.createdAt)),
    db.select().from(connectionGrant).where(eq(connectionGrant.connectionId, connectionId)),
  ]);
  return instances.map((i) => {
    const g = grants.find((x) => x.instanceId === i.id);
    return {
      instanceId: i.id,
      alias: i.alias,
      integrationName: i.integrationName,
      integrationSlug: i.integrationSlug,
      enabled: !!g,
      perm: g ? grantToPerm(g) : NONE,
      policyId: g?.policyId ?? null,
    };
  });
}

// The rule every call goes through: what the connection allows on this
// instance, narrowed by the caller's role. Checked fresh on every call.
export async function effectivePerm(connectionId: string, instanceId: string, role: CallerRole): Promise<Perm> {
  const g = await db.query.connectionGrant.findFirst({
    where: and(eq(connectionGrant.connectionId, connectionId), eq(connectionGrant.instanceId, instanceId)),
  });
  if (!g) return NONE;
  return intersect(grantToPerm(g), ROLE_CAP[role]);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Creates a connection with every current instance enabled at the default
// policy (read, create, edit on; delete off). Retries the name with a
// numeric suffix if the org already uses it.
export async function createConnection(
  params: {
    organizationId: string;
    workspaceId: string;
    name: string;
    authMode: "members" | "public";
    description?: string | null;
    createdByUserId: string | null;
    allInstances?: boolean;
  },
  tx: Tx | typeof db = db,
) {
  const id = newId();
  // (org, name, short id) is unique and rows are never removed, so a short
  // id is never reused for the same name. Pick one that's free.
  let shortId = newShortId();
  for (let i = 0; i < 20; i++) {
    const taken = await tx
      .select({ id: connection.id })
      .from(connection)
      .where(and(eq(connection.organizationId, params.organizationId), eq(connection.name, params.name), eq(connection.shortId, shortId)))
      .limit(1);
    if (!taken.length) break;
    shortId = newShortId(i < 10 ? 4 : 6);
  }
  await tx.insert(connection).values({
    id,
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    name: params.name,
    shortId,
    authMode: params.authMode,
    description: params.description ?? null,
    createdByUserId: params.createdByUserId,
  });
  if (params.allInstances !== false) {
    const instances = await tx.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, params.workspaceId));
    if (instances.length) {
      await tx.insert(connectionGrant).values(
        instances.map((i) => ({
          id: newId(),
          connectionId: id,
          instanceId: i.id,
          // Public connections start read only, matching their cap.
          allowCreate: params.authMode !== "public",
          allowEdit: params.authMode !== "public",
          allowDelete: false,
        })),
      );
    }
  }
  return id;
}

// The workspace's first live members-only connection, created on demand so
// the first-run flow ends with a real URL. Named after the workspace
// (names don't need to be unique, so no suffixing).
export async function primaryConnection(ws: {
  organizationId: string;
  workspaceId: string;
  workspaceSlug: string;
}, userId: string | null): Promise<ConnectionRow> {
  const existing = await db
    .select({ c: connection, orgSlug: organization.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .where(
      and(
        eq(connection.workspaceId, ws.workspaceId),
        eq(connection.authMode, "members"),
        isNull(connection.sunsetAt),
        isNull(connection.deletedAt),
      ),
    )
    .orderBy(asc(connection.createdAt))
    .limit(1);
  if (existing[0]) return toRow(existing[0]);
  const name = toConnectionName(ws.workspaceSlug) || "default";
  const id = await createConnection({
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    name,
    authMode: "members",
    description: "Created automatically for this workspace",
    createdByUserId: userId,
  });
  return (await getConnection(ws.workspaceId, id))!;
}

// A newly added instance joins the workspace's primary connection, so the
// URL the user already pasted into their agent picks it up.
export async function addInstanceToPrimaryConnection(workspaceId: string, instanceId: string, tx: Tx | typeof db = db) {
  const [first] = await tx
    .select({ id: connection.id })
    .from(connection)
    .where(
      and(
        eq(connection.workspaceId, workspaceId),
        eq(connection.authMode, "members"),
        isNull(connection.sunsetAt),
        isNull(connection.deletedAt),
      ),
    )
    .orderBy(asc(connection.createdAt))
    .limit(1);
  if (!first) return;
  await tx
    .insert(connectionGrant)
    .values({ id: newId(), connectionId: first.id, instanceId })
    .onConflictDoNothing();
}

// Replacing a connection (naming doc v2, section 6): a new connection,
// usually with the same name, gets a new short id and a copy of the old
// one's policy. The old one keeps working until its cutoff, and until then
// tells every client the new URL. Without a cutoff the old one stays live
// until someone sunsets it explicitly.
export async function replaceConnection(params: {
  old: ConnectionRow;
  name?: string;
  cutoff: Date | null;
  message?: string | null;
  createdByUserId: string | null;
}) {
  return db.transaction(async (tx) => {
    const newId_ = await createConnection(
      {
        organizationId: params.old.organizationId,
        workspaceId: params.old.workspaceId,
        name: params.name ?? params.old.name,
        authMode: params.old.authMode as "members" | "public",
        description: params.old.description,
        createdByUserId: params.createdByUserId,
        allInstances: false,
      },
      tx,
    );
    const grants = await tx.select().from(connectionGrant).where(eq(connectionGrant.connectionId, params.old.id));
    if (grants.length) {
      await tx.insert(connectionGrant).values(
        grants.map((g) => ({
          id: newId(),
          connectionId: newId_,
          instanceId: g.instanceId,
          allowRead: g.allowRead,
          allowCreate: g.allowCreate,
          allowEdit: g.allowEdit,
          allowDelete: g.allowDelete,
          policyId: g.policyId,
        })),
      );
    }
    await tx
      .update(connection)
      .set({
        replacedByConnectionId: newId_,
        ...(params.cutoff ? { sunsetAt: params.cutoff, sunsetMessage: params.message ?? null } : {}),
      })
      .where(eq(connection.id, params.old.id));
    return newId_;
  });
}

// Everyone who signed in to a connection and still holds a live grant on
// it: the people to tell when it's being sunset.
export async function connectionTokenHolders(connectionId: string) {
  return db
    .selectDistinct({ userId: user.id, email: user.email, name: user.name })
    .from(oauthGrant)
    .innerJoin(user, eq(user.id, oauthGrant.userId))
    .where(and(eq(oauthGrant.connectionId, connectionId), isNull(oauthGrant.revokedAt)));
}
