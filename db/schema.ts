import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Better Auth owns these four tables' shape. ----------
// Field names match Better Auth's Drizzle adapter defaults so no field
// mapping config is needed. Do not rename or wrap them (spec section 4).

export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Namespace: organization, workspace, membership ----------

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(), // 'personal' | 'organization'
  // Null only for the system @zeqqat org on a self-hosted install, which
  // holds the bundled catalog and has no owner or members
  // (lib/official-catalog.ts). Every other org has an owner.
  ownerUserId: uuid("owner_user_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("organization_kind_check", sql`${t.kind} in ('personal','organization')`),
  // Naming doc v2, section 1: lowercase snake_case. The slug is the first
  // segment of every wire tool name and the first path segment of every
  // page URL, so `-` (the wire separator) is never allowed in it.
  check("organization_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
]);

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  // Set once the owner has answered "keep using this site or self-host"
  // after first setup. Null means that screen hasn't been answered yet.
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("workspace_org_slug_unique").on(t.organizationId, t.slug),
]);

export const membership = pgTable("membership", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'owner' | 'member'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("membership_user_org_unique").on(t.userId, t.organizationId),
  check("membership_role_check", sql`${t.role} in ('owner','member')`),
]);

// Who is in a workspace and what they may do there. Org membership says
// "belongs to this team"; workspace membership says "works in this part of
// it" (marketing vs engineering). Org owners are implicitly admins of every
// workspace in their org and need no row here.
//   admin  — manages services (keys), connections, members; every action
//   member — read, create and edit through any connection they can use
//   viewer — read only
// A caller's effective permission on a call is the connection's policy
// intersected with their role, so one connection URL serves a whole team.
export const workspaceMember = pgTable("workspace_member", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'admin' | 'member' | 'viewer'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("workspace_member_ws_user_unique").on(t.workspaceId, t.userId),
  check("workspace_member_role_check", sql`${t.role} in ('admin','member','viewer')`),
]);

// An invite is bound to one email address (the Google account that may
// accept it) and one organization. Only the token's hash is stored, the
// same way OAuth tokens are, so a database read never yields a usable link.
// It also names the workspace the person joins and their role there (null
// workspace means the org's first workspace).
export const invitation = pgTable("invitation", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspace.id, { onDelete: "cascade" }),
  workspaceRole: text("workspace_role").notNull().default("member"),
  email: text("email").notNull(), // stored lowercased
  role: text("role").notNull(), // 'owner' | 'member'
  tokenHash: text("token_hash").notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("invitation_role_check", sql`${t.role} in ('owner','member')`),
]);

// ---------- OAuth as provider, to agents ----------

export const oauthClient = pgTable("oauth_client", {
  id: uuid("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash"),
  clientName: text("client_name").notNull(),
  redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  softwareId: text("software_id"),
});

export const oauthGrant = pgTable("oauth_grant", {
  id: uuid("id").primaryKey(),
  oauthClientId: uuid("oauth_client_id")
    .notNull()
    .references(() => oauthClient.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  // The connection URL this grant was issued for. A token only works on
  // that URL. Null for legacy grants made through the bare /mcp endpoint.
  connectionId: uuid("connection_id").references(() => connection.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const oauthToken = pgTable("oauth_token", {
  id: uuid("id").primaryKey(),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => oauthGrant.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'access' | 'refresh'
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  check("oauth_token_kind_check", sql`${t.kind} in ('access','refresh')`),
]);

// Authorization codes: short lived, PKCE challenge stored, single use.
// Rows are deleted on exchange rather than marked used.
export const oauthAuthorizationCode = pgTable("oauth_authorization_code", {
  id: uuid("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  oauthClientId: uuid("oauth_client_id")
    .notNull()
    .references(() => oauthClient.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => connection.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("oauth_code_challenge_method_check", sql`${t.codeChallengeMethod} = 'S256'`),
]);

// ---------- Catalog: integration, spec snapshot, endpoints, instances ----------
// Shapes follow section 8 of the Project context doc ("Zeqqat: Project
// Context"). The catalog is org-scoped: any org can import its own copy of
// an integration. `official` marks the copy Zeqqat offers by default; it is
// a flag, not a lock.

export const integration = pgTable("integration", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(), // e.g. "dokploy"
  name: text("name").notNull(), // e.g. "Dokploy"
  official: boolean("official").notNull().default(false),
  // Set when the integration was imported from a URL (lib/spec-import.ts):
  // where its spec and docs live, the logo the UI shows for its calls, and
  // the API's own address from the spec, offered when adding an instance.
  specUrl: text("spec_url"),
  docsUrl: text("docs_url"),
  logoUrl: text("logo_url"),
  defaultBaseUrl: text("default_base_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("integration_org_slug_unique").on(t.organizationId, t.slug),
  // The slug is the `target` segment of its tools' names.
  check("integration_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
]);

// Immutable: one row per import, never updated or deleted. `hash` (sha256
// of the raw spec) tells a re-import of the same file from a real change;
// `release` is the upstream version or git sha when known.
export const integrationApiSpecSnapshot = pgTable("integration_api_spec_snapshot", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integration.id, { onDelete: "cascade" }),
  release: text("release"),
  hash: text("hash").notNull(),
  sourceUrl: text("source_url"),
  rawSpec: jsonb("raw_spec"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("integration_api_spec_snapshot_hash_unique").on(t.integrationId, t.hash),
]);

// One row per endpoint, upserted in place: current state only, history
// lives in the snapshots. `lastSnapshotId` is the import that last touched
// the row. `removedAt` flags an endpoint that is gone from the latest spec
// instead of deleting it, so old call logs keep resolving.
export const apiEndpoint = pgTable("api_endpoint", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integration.id, { onDelete: "cascade" }),
  lastSnapshotId: uuid("last_snapshot_id").references(() => integrationApiSpecSnapshot.id, {
    onDelete: "set null",
  }),
  // The raw operationId exactly as the spec has it, e.g. "application.stop"
  // (Dokploy tRPC-style). This is what agents see in zeqqat_search and pass
  // to zeqqat_run (with an instance, which fixes the integration), and what
  // policies list.
  name: text("name").notNull(),
  // The action segment of the canonical name @org/target.http.action,
  // written once at import: the operationId sanitized to snake_case, never
  // shortened (catalog names never reach an MCP client's name check, so
  // there is no length budget). org = the integration's org, target = the
  // integration's slug.
  action: text("action").notNull(),
  major: integer("major").notNull().default(1),
  method: text("method").notNull(),
  path: text("path").notNull(),
  summary: text("summary"),
  // Where summary came from: 'spec' (the spec or the bundled
  // summaries.json) or 'accepted' (the publisher accepted a suggestion,
  // lib/feedback.ts). Imports never overwrite an accepted summary.
  summarySource: text("summary_source").notNull().default("spec"),
  description: text("description"),
  tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema"),
  outputSchemaSource: text("output_schema_source").notNull().default("declared"),
  pathParams: jsonb("path_params").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  // Inputs the spec puts in the query string. On GET/DELETE every input
  // that isn't a path param goes there anyway; on POST/PUT/PATCH only these.
  queryParams: jsonb("query_params").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  // How a request body is sent: JSON, or form-encoded (Stripe and others).
  bodyEncoding: text("body_encoding").notNull().default("json"),
  credentialScheme: jsonb("credential_scheme").notNull(),
  // Assigned by hand in catalog/<slug>/kinds.json and applied on every
  // import, never derived from `method` — Dokploy's tRPC-style API doesn't
  // map HTTP verbs to read/write semantics reliably. An endpoint the kind
  // map doesn't cover yet is imported as `delete` (lib/importer/openapi.ts).
  kind: text("kind").notNull(),
  // Problems the importer hit on this endpoint. Imports never abort over
  // one bad endpoint; they record it here.
  importWarnings: jsonb("import_warnings").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("api_endpoint_integration_name_unique").on(t.integrationId, t.name),
  unique("api_endpoint_integration_action_major_unique").on(t.integrationId, t.action, t.major),
  check("api_endpoint_action_check", sql`${t.action} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
  check("api_endpoint_major_check", sql`${t.major} >= 1`),
  check("api_endpoint_method_check", sql`${t.method} in ('GET','POST','PUT','PATCH','DELETE')`),
  check("api_endpoint_path_check", sql`${t.path} like '/%'`),
  check("api_endpoint_input_schema_check", sql`jsonb_typeof(${t.inputSchema}) = 'object'`),
  check("api_endpoint_output_schema_source_check", sql`${t.outputSchemaSource} in ('declared','observed')`),
  check("api_endpoint_body_encoding_check", sql`${t.bodyEncoding} in ('json','form')`),
  check("api_endpoint_kind_check", sql`${t.kind} in ('read','create','edit','delete')`),
  check("api_endpoint_summary_source_check", sql`${t.summarySource} in ('spec','accepted')`),
]);

export const instance = pgTable("instance", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integration.id),
  alias: text("alias").notNull(),
  baseUrl: text("base_url").notNull(),
  // AES-256-GCM ciphertext + iv + tag, base64. Never returned by any read path.
  credential: jsonb("credential").notNull().$type<{
    ciphertext: string;
    iv: string;
    tag: string;
  }>(),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  // What the last connection test found: the upstream version string and
  // whether the key was accepted. Display only, never used for access.
  lastVersion: text("last_version"),
  lastStatus: text("last_status"), // 'ok' | 'bad_key' | 'unreachable' | 'not_dokploy'
  // Null follows the latest import; set, the instance stays on that spec.
  pinnedSnapshotId: uuid("pinned_snapshot_id").references(() => integrationApiSpecSnapshot.id, {
    onDelete: "set null",
  }),
  // A protected instance (usually production) needs explicit confirmation
  // before changes run on it.
  protected: boolean("protected").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("instance_workspace_alias_unique").on(t.workspaceId, t.alias),
]);

// ---------- Permissions: who may reach what ----------
// Per (workspace, instance, agent) — null oauthClientId is the workspace
// default, a client row overrides it. Four independent booleans instead of
// the spec's original binary allow/deny: new grants allow read/create/edit
// and deny delete by default (agreed decision, not in the original spec).

export const instanceGrant = pgTable("instance_grant", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => instance.id, { onDelete: "cascade" }),
  oauthClientId: uuid("oauth_client_id").references(() => oauthClient.id, {
    onDelete: "cascade",
  }),
  allowRead: boolean("allow_read").notNull().default(true),
  allowCreate: boolean("allow_create").notNull().default(true),
  allowEdit: boolean("allow_edit").notNull().default(true),
  allowDelete: boolean("allow_delete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("instance_grant_scope_unique").on(t.workspaceId, t.instanceId, t.oauthClientId),
]);

// ---------- Connections: the MCP URLs a workspace hands to agents ----------
// A connection is one URL, /<org>/mcp/<name>/<shortId> (naming doc v2,
// section 6), plus a policy saying what can be reached through it. The URL
// carries the org's brand. Names say what the connection is for and do
// NOT have to be unique: replacing a connection means creating a new one,
// usually with the same name, which gets a new short id. A short id is
// never reused for the same name in the same org: rows are soft-deleted
// (`deletedAt`), never removed, so the (org, name, shortId) unique
// constraint keeps holding forever.
//
// authMode 'members': OAuth required; the caller must be in the workspace,
//   and their role narrows the policy further.
// authMode 'public': no sign-in. Every call runs with the workspace's own
//   credentials, so public callers are capped at read no matter what the
//   policy says.

export const connection = pgTable("connection", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // snake_case, immutable, not unique
  shortId: text("short_id").notNull(),
  authMode: text("auth_mode").notNull().default("members"),
  description: text("description"),
  // The sunset cutoff. Before it (the warning period) everything works and
  // the server's instructions and every result carry the replacement URL
  // and this date. From it on, connecting still works so the model can
  // explain, but no tools are listed. Null = not being sunset.
  sunsetAt: timestamp("sunset_at", { withTimezone: true }),
  sunsetMessage: text("sunset_message"),
  // The connection that takes over, when there is one. Its URL is what the
  // warning and cutoff messages point clients to.
  replacedByConnectionId: uuid("replaced_by_connection_id").references((): AnyPgColumn => connection.id, {
    onDelete: "set null",
  }),
  // Soft delete: the URL stops answering (it looks exactly like a URL that
  // never existed), but the row stays so its short id is never reused.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("connection_org_name_short_id_unique").on(t.organizationId, t.name, t.shortId),
  check("connection_auth_mode_check", sql`${t.authMode} in ('members','public')`),
  check("connection_name_check", sql`${t.name} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
]);

// The connection's ceiling per instance. No row means the instance is not
// reachable through this connection at all. With `policyId` set, the
// policy's explicit allow list decides which tools run (project doc
// mcp-context-and-policy-v1, section 5) and the four booleans are ignored;
// without one, the booleans allow tools by kind, as before policies existed.
export const connectionGrant = pgTable("connection_grant", {
  id: uuid("id").primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connection.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => instance.id, { onDelete: "cascade" }),
  // Restrict: a policy in use can't be deleted out from under a connection.
  policyId: uuid("policy_id").references((): AnyPgColumn => policy.id, { onDelete: "restrict" }),
  allowRead: boolean("allow_read").notNull().default(true),
  allowCreate: boolean("allow_create").notNull().default(true),
  allowEdit: boolean("allow_edit").notNull().default(true),
  allowDelete: boolean("allow_delete").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("connection_grant_unique").on(t.connectionId, t.instanceId),
]);

// A connection URL that moved when its workspace was transferred to another
// namespace (personal namespace to team org). The old URL keeps working,
// and every result tells the client the new one.
export const connectionAlias = pgTable("connection_alias", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortId: text("short_id").notNull(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connection.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("connection_alias_org_name_short_id_unique").on(t.organizationId, t.name, t.shortId),
]);

// A username an account used to have. Renaming keeps the old one pointing at
// the account: old connection URLs keep working (with a notice telling the
// agent to update), old public pages redirect, and nobody else can take the
// old name. Renaming back to it removes the row.
export const usernameAlias = pgTable("username_alias", {
  slug: text("slug").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Policies (project doc mcp-context-and-policy-v1, section 5) ----------
// A policy is owned by a namespace (personal or team), written for one
// integration's spec, and attached to an instance inside a connection
// (connection_grant.policy_id). It is an explicit allow list of
// operationIds: anything not listed is denied, so a spec update that adds
// tools never grants them by itself, and an author's kind labels can't
// grant anything. It works on any instance whose integration has the same
// slug, whichever namespace imported it, because operationIds come from
// the spec. Canonical name: @<namespace>/<integration slug>.policy.<name>.
export const policy = pgTable("policy", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // The integration the policy was written against; its slug decides which
  // instances can use it.
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integration.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  allow: jsonb("allow").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  // The spec release the allow list was last reviewed against.
  specRelease: text("spec_release"),
  // Bumped on every save. Copies record which version they came from.
  version: integer("version").notNull().default(1),
  // 'public' policies are listed on the namespace's page and can be copied.
  visibility: text("visibility").notNull().default("private"),
  // Copy on install: a copy is the installer's own policy and never changes
  // when the source does; it only gets an "update available" note.
  copiedFromPolicyId: uuid("copied_from_policy_id").references((): AnyPgColumn => policy.id, { onDelete: "set null" }),
  copiedFromName: text("copied_from_name"),
  copiedFromVersion: integer("copied_from_version"),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  updatedByUserId: uuid("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("policy_org_integration_name_unique").on(t.organizationId, t.integrationId, t.name),
  check("policy_name_check", sql`${t.name} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
  check("policy_visibility_check", sql`${t.visibility} in ('public','private')`),
  check("policy_allow_check", sql`jsonb_typeof(${t.allow}) = 'array'`),
]);

// Every saved version of a policy, for audit and undo.
export const policyRevision = pgTable("policy_revision", {
  id: uuid("id").primaryKey(),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => policy.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  description: text("description").notNull(),
  allow: jsonb("allow").notNull().$type<string[]>(),
  specRelease: text("spec_release"),
  changedByUserId: uuid("changed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("policy_revision_policy_version_unique").on(t.policyId, t.version),
]);

// Which of a namespace's workspaces may pick a policy.
export const workspacePolicy = pgTable("workspace_policy", {
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => policy.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.policyId] }),
]);

// ---------- Rate limiting ----------
// Fixed-window counters, one row per (key, window). Durable and shared
// across replicas, unlike the per-process Map this replaced. The tradeoff
// of a fixed window over a sliding one is a burst of up to 2x the limit
// straddling a window boundary — acceptable here, and far better than a
// limiter that resets to zero on every deploy.

export const rateLimitBucket = pgTable("rate_limit_bucket", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.windowStart] }),
]);

// ---------- Secret handles ----------

// A secret an agent can use without seeing it (lib/secret-handles.ts).
// When a response carries a secret, the agent gets {{zq_secret_...}} in
// its place; passing that handle in a later zeqqat_run input has Zeqqat
// fill the value in server-side. zeqqat_secret mints one from a fresh
// random value. Bound to the connection it was issued on and, once used
// or when it came from a response, to one instance. Rows expire after
// HANDLE_TTL_MS and are deleted; the value lives on only where it was
// written (an app's env, a database).
export const secretHandle = pgTable("secret_handle", {
  id: text("id").primaryKey(), // zq_secret_<16 chars>
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connection.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id").references(() => instance.id, { onDelete: "cascade" }),
  value: jsonb("value").notNull().$type<{ ciphertext: string; iv: string; tag: string }>(),
  // "response" (taken from an upstream result) or "generated" (zeqqat_secret).
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("secret_handle_expires_idx").on(t.expiresAt),
]);

// ---------- The log ----------

// One request: one thing a person asked their agent to do, grouping every
// call the agent made for it (Activity design, project doc
// activity-request-card-v1). The agent passes the same `reason` on every
// call it makes for one request; calls with the same person, agent and
// reason within REQUEST_WINDOW_MS (lib/requests.ts) of the last one join
// the same row. Not grouped by MCP session: each connection is a separate
// MCP server to the agent, and one request can use several connections.
// A public connection has no person, so its calls group by connection.
export const agentRequest = pgTable("agent_request", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").references(() => user.id),
  oauthClientId: uuid("oauth_client_id").references(() => oauthClient.id),
  // Only set for public connections, where there is no user to group by.
  connectionId: uuid("connection_id").references(() => connection.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastCallAt: timestamp("last_call_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agent_request_lookup_idx").on(t.userId, t.oauthClientId, t.reason, t.lastCallAt),
]);

// Append-only: rows are inserted, and a running call's row is updated once
// when it finishes. Nothing edits or deletes history.
export const callLog = pgTable("call_log", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  oauthClientId: uuid("oauth_client_id").references(() => oauthClient.id),
  userId: uuid("user_id").references(() => user.id),
  connectionId: uuid("connection_id").references(() => connection.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  instanceId: uuid("instance_id").references(() => instance.id),
  apiEndpointId: uuid("api_endpoint_id").references(() => apiEndpoint.id),
  // 'running' while Zeqqat waits on the upstream API; the row is updated
  // to its final outcome when the call returns.
  outcome: text("outcome").notNull(), // 'running' | 'ok' | 'error' | 'blocked'
  requestId: uuid("request_id").references(() => agentRequest.id),
  // The agent's one-line reason, scrubbed. Required on search, describe
  // and run; null on rows from before it was.
  reason: text("reason"),
  // Copied at call time, because they can change or disappear later and
  // the log has to say what was true when the call ran.
  instanceAlias: text("instance_alias"),
  callerRole: text("caller_role"),
  policyName: text("policy_name"), // canonical, e.g. @gaita/dokploy.policy.read_plus_deploy
  policyVersion: integer("policy_version"),
  specRelease: text("spec_release"),
  // What Zeqqat sent upstream: method, url, query or body, headers. The
  // credential header's value is never stored, only its name.
  outboundRequest: jsonb("outbound_request"),
  httpStatus: integer("http_status"),
  durationMs: integer("duration_ms").notNull(),
  requestSummary: jsonb("request_summary"), // legacy, superseded by requestArgs below
  // Full request/response, for the per-call detail view — capped before
  // insert (capJson in lib/call-log.ts) so one huge upstream response can't
  // bloat the table. responseBody is already scrubbed by the caller before
  // it gets here (executor.ts/mcp-tools.ts both scrub before returning to
  // the agent) — this stores exactly what the agent saw, never the raw
  // pre-scrub payload.
  requestArgs: jsonb("request_args"),
  responseBody: jsonb("response_body"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("call_log_outcome_check", sql`${t.outcome} in ('running','ok','error','blocked')`),
  index("call_log_request_idx").on(t.requestId, t.createdAt),
  index("call_log_org_created_idx").on(t.organizationId, t.createdAt),
]);

// ---------- Install telemetry (lib/telemetry.ts) ----------

// This install's anonymous id: one row, created on first start. It is the
// only thing that ties one install's pings together; it is random and says
// nothing about who runs the install.
export const installIdentity = pgTable("install_identity", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Received pings, one row per install. Only the hosted zeqqat.com
// (ZEQQAT_EDITION=cloud) accepts pings, so on a self-hosted install this
// stays empty. No IP address, hostname or user data is stored.
export const telemetryInstall = pgTable("telemetry_install", {
  installId: uuid("install_id").primaryKey(),
  version: text("version").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  pingCount: integer("ping_count").notNull().default(1),
}, (t) => [
  index("telemetry_install_last_seen_idx").on(t.lastSeenAt),
]);

// Search words agents used before finding a tool (lib/keywords.ts). When
// an agent searched, the search missed a tool, and the agent then ran that
// tool in the same request, each new plain word of the search is recorded
// here, once per request. A word becomes a keyword of the tool (matched by
// zeqqat_search, never shown to agents) once KEYWORD_MIN_REQUESTS
// different requests recorded it. Only the word is stored: never the
// query, inputs or results.
export const endpointKeywordHit = pgTable("endpoint_keyword_hit", {
  id: uuid("id").primaryKey(),
  apiEndpointId: uuid("api_endpoint_id")
    .notNull()
    .references(() => apiEndpoint.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => agentRequest.id, { onDelete: "cascade" }),
  // Who the request belonged to, so a threshold can later require several
  // organizations before a word counts for everyone.
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("endpoint_keyword_hit_unique").on(t.apiEndpointId, t.word, t.requestId),
  index("endpoint_keyword_hit_word_idx").on(t.word),
  check("endpoint_keyword_hit_word_check", sql`${t.word} ~ '^[a-z]{3,20}$'`),
]);

// A better one-line summary for a tool, proposed by an agent through
// zeqqat_feedback (lib/feedback.ts). Owners of the org that publishes the
// integration accept or reject it in the dashboard; an accepted one
// becomes the tool's summary for everyone using that integration.
// Summaries are read by models, so none goes live without a person.
export const summarySuggestion = pgTable("summary_suggestion", {
  id: uuid("id").primaryKey(),
  apiEndpointId: uuid("api_endpoint_id")
    .notNull()
    .references(() => apiEndpoint.id, { onDelete: "cascade" }),
  // The org that publishes the integration: its owners review.
  publisherOrganizationId: uuid("publisher_organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // Where it came from. Shown to the publisher as the account's username.
  fromOrganizationId: uuid("from_organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  requestId: uuid("request_id").references(() => agentRequest.id, { onDelete: "set null" }),
  currentSummary: text("current_summary"),
  suggestedSummary: text("suggested_summary").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("summary_suggestion_publisher_status_idx").on(t.publisherOrganizationId, t.status),
  check("summary_suggestion_status_check", sql`${t.status} in ('pending','accepted','rejected')`),
  check("summary_suggestion_length_check", sql`char_length(${t.suggestedSummary}) between 10 and 120`),
]);
