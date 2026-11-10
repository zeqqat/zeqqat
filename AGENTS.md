# Zeqqat

One MCP endpoint for every tool you've connected. An agent (Claude, or any
MCP-speaking client) signs in once via OAuth, then reaches every
integration (Dokploy today, more over time) through a few stable built-in
tools (`zeqqat_search`, `zeqqat_describe`, `zeqqat_run`, `zeqqat_whoami`,
`zeqqat_policy`, `zeqqat_secret`, `zeqqat_docs`) instead of learning a new tool surface per
integration.

## Stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Postgres via `drizzle-orm` (`node-postgres` driver)
- Better Auth (Google, GitHub, email and password sign-in for humans,
  accounts linked by email). `lib/auth-providers.ts` decides what renders.
  Email sign-in is a 6-digit code (`emailOTP` plugin), offered only when
  `email` is in `ENABLED_AUTH_PROVIDERS` and a mailer is set
  (`lib/mailer.ts`: `MAIL_FROM` plus `RESEND_API_KEY` or `SMTP_URL`).
  **Password is self-hosted only** (never on zeqqat.com) and the
  self-hosted default: the first account signs itself up and owns the
  install, then a password account can only be created from an invite link
  for that exact email (`x-zeqqat-invite` header, `lib/password-auth.ts`).
  Reset: emailed link with a mailer, else the install's owner (its first
  account) makes one on the Team page (`lib/actions/password.ts`).
  **Verified email is a zeqqat.com rule only:** cloud refuses accounts and
  sessions without one; self-hosted installs don't check.
  `pnpm exec tsx tests/e2e/password-flow.ts` runs the password flow.
- pnpm — this repo enforces it (`preinstall: npx only-allow pnpm`)

- **Dev tools** (`ZEQQAT_DEV_TOOLS=1`, ignored on zeqqat.com,
  `lib/dev-tools.ts`): the account menu gets "Start over as a new user".
  It retires the signed-in user instead of deleting it (email and sign-in
  links rewritten so nothing matches them, originals kept inside), so the
  next sign-in with the same Google account or email is a brand new user.
  "Switch back to" restores an earlier one. Nothing is ever deleted. For
  email sign-in, `you+anything@gmail.com` also gives a new user each time.

## Commands

```
pnpm dev              # local dev server
pnpm build            # production build
pnpm check            # typecheck + lint + test — run before considering anything done
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest unit + regression tests
pnpm test:e2e         # playwright, only meaningful against a real deploy
pnpm db:generate      # drizzle-kit generate, after editing db/schema.ts
pnpm db:migrate       # drizzle-kit migrate
```

## Domain model

Two worlds, kept deliberately separate:

- **Catalog (no credentials):** `integration` is a *kind* of system (e.g.
  "Dokploy"). It is org-scoped (`organization_id`, unique per org + slug),
  so any org can import its own copy; `official` marks the copy the app
  offers. `integration_api_spec_snapshot` is one immutable row per import,
  with `hash` (sha256 of the raw spec) and `release`. `api_endpoint` is one
  row per endpoint, upserted in place: `last_snapshot_id` is the import
  that last touched it, `import_warnings` records parse problems,
  `removed_at` flags endpoints gone from the latest spec (never deleted,
  never callable). Each endpoint has a hand-assigned `kind` (`read` /
  `create` / `edit` / `delete`), because HTTP verbs don't map cleanly onto
  Dokploy's tRPC-style API; permissions are checked against it.
- **Tenant (credentials):** `instance` is one server of an integration that
  a workspace added (a URL + an encrypted API key). Two independently
  hosted Dokploy servers are two instances of one integration.
  `pinned_snapshot_id` (null = follow latest) and `protected` (needs
  explicit confirmation, not enforced yet) come from the design doc.

**The official catalog** is owned by the `@zeqqat` organization and bundled
in `catalog/<slug>/`: `openapi.json` (the spec as fetched), `kinds.json`
(the hand-assigned kind of every endpoint, with a reason where it isn't
obvious from the name), `summaries.json` (a one-line summary per endpoint,
written once and bundled, because Dokploy's spec has none; search matches
on it, and the spec's own summary wins when it has one) and
`manifest.json` (name, source, release, and `nameFrom`). `lib/official-catalog.ts` imports it on startup (after
migrations; `ZEQQAT_CATALOG_SYNC=0` skips it) and before an instance is
added, so every install has it with no manual step. Re-running is a
no-op unless the spec or kinds changed.

**zeqqat.com is the source of truth, self-hosted installs are local.**
@zeqqat exists on every install, but it means zeqqat.com's @zeqqat: the
catalog a self-hosted install has came from (and will be pulled from)
zeqqat.com. So `zeqqat` is reserved everywhere (no sign-up or new org can
take it), and the org is only created by `lib/official-catalog.ts`. On
zeqqat.com it is owned by the operator. On a self-hosted install it is a
system org with **no owner and no members** (`organization.owner_user_id`
is null only there), so nobody on someone else's install ever holds
@zeqqat; older installs that gave it to their first user have that taken
back on start. Every other org name on a self-hosted install is local to
that install. Publishing anything (policies, integrations) for others will
need an org on zeqqat.com, not a local one (planned, not built).
`pnpm exec tsx tests/e2e/system-org-flow.ts` checks the ownership rules.

- `lib/importer/openapi.ts` is pure (spec in, rows out) and tested against
  the bundled spec. `lib/catalog-import.ts` persists: one snapshot per
  distinct file (sha256), endpoints upserted by name, `removed_at` for
  endpoints gone from the spec. Import never erases a hand-written summary
  or description, and never replaces an observed output schema.
- Dokploy endpoints are named by **path** (`application.stop`, the tRPC
  procedure), not by the spec's operationId (`application-stop`). Agents,
  policies and call logs use the dotted name. Paths carry the spec
  server's base path (`/api/application.stop`), which the executor needs.
- **Kinds:** read = changes nothing and sends nothing; create = adds a new
  object; edit = changes something that exists, or sends a message out;
  delete = removes something or destroys data Dokploy can't recover
  (database `rebuild` wipes data, so it is delete). An endpoint missing
  from `kinds.json` imports as `delete` with an import warning, and
  `tests/unit/openapi-import.test.ts` fails until it is classified.
- **Updating the Dokploy spec:** replace `catalog/dokploy/openapi.json`,
  classify any new endpoints in `kinds.json` and summarize them in
  `summaries.json`, update `kinds.json`'s `specSha256` and the manifest's
  `release`, run `pnpm test` (it fails while an endpoint lacks either).

**UI vocabulary matches the code.** The dashboard says Integrations and
instances. Never label anything "Service": Dokploy uses "service" for an
app or database inside a project, so the word is ambiguous to users and
agents. The Integrations page (`/app/integrations`) groups instances under
their integration; instance pages stay at `/app/instances/<id>`.

**Org → workspace → connection** is the access model:

- **`organization`** owns members (`membership`, `owner` | `member`) and
  gives every URL its brand. Its slug is lowercase snake_case
  (`acme_corp`), globally unique, and never one of the reserved words in
  `lib/username.ts` (they are the app's own top-level routes). Org owners
  are admins of every workspace.
- **`workspace`** splits an org by team (Engineering gets deploy tools,
  Marketing gets social). It holds its own instances (keys), connections
  and members (`workspace_member`, `admin` | `member` | `viewer`).
  Workspaces are internal: they never appear in a URL or tool name; the
  token decides which workspace a caller is in.
- **`connection`** is one MCP URL, `/<org>/mcp/<name>/<shortId>`, owned by
  the org and belonging to exactly one workspace, plus a per-instance
  ceiling (`connection_grant`). Names are snake_case, immutable, and **not
  unique**: the short id tells same-named connections apart, and
  (org, name, short id) is unique. Rows are soft-deleted (`deleted_at`),
  never removed, so a short id is never reused for the same name.
  `auth_mode` is `members` (OAuth, caller must be in the workspace) or
  `public` (no sign-in, always capped at read).
- **Replacing and sunsetting.** To replace a connection, create a new one
  (usually the same name, new short id, policy copied:
  `replaceConnection`); the old one points at it via
  `replaced_by_connection_id`. `sunset_at` is the cutoff. Before it
  (warning) everything works, and the server's `instructions` and every
  tool result carry the new URL and the date. From it on (cutoff),
  connecting still works so the model can explain, but `tools/list` is
  empty. Zeqqat has no mailer yet, so the dashboard lists the people to
  tell instead of emailing them.

**Connection URL = page + MCP.** `proxy.ts` (Next 16's renamed
middleware) looks at method and `Accept` on every connection path:
POST is rewritten to `app/mcp-internal/...` (which can't be requested
directly); GET asking for `text/html` gets the page in
`app/[org]/mcp/[name]/[id]`; any other GET (`text/event-stream`, `*/*`) and
every other method is 405, never HTML. MCP and 405 responses carry
`Vary: Accept`. The page is 404 unless you're signed in and in the
connection's workspace; admins also see who uses it. The MCP branch checks
`Origin` (403 if it's a browser on another origin; extra origins via
`ZEQQAT_ALLOWED_ORIGINS`), and answers the **same 401** for a connection
that doesn't exist as for one without a token.

**Page URLs** are org-first, like GitHub: `/<org>` (org page),
`/<org>/<target.type.action>` (tool page; tool names always have two dots,
so this never collides with `/<org>/mcp/...` or a future `/<org>/c/...`).
In-app names keep the `@` (`@gaita/...`), URLs drop it. HTTP tools aren't
versioned in URLs: an `@x.y.z` pin redirects to the latest.

Effective permission on every call (`accessFor` / `toolAllowed` in
`lib/policies.ts`, checked fresh on every call): if the connection grant
for the instance has a **policy** attached, only the operationIds on its
allow list may run; otherwise the grant's booleans allow whole kinds.
Either way the caller's role cap (`ROLE_CAP` in `lib/connections.ts`)
applies on top, by kind.

**Policies** (`policy`, `policy_revision`, `workspace_policy`;
`connection_grant.policy_id`): owned by a namespace, written for one
integration (canonical `@ns/integration.policy.name`), attached to one
instance per connection, usable on any instance whose integration has the
same slug. Explicit allow list: anything not listed is denied, including
tools a later spec adds; kinds only help fill the list in the editor.
Every save bumps `version` and writes a revision (history, restore).
`spec_release` records the spec reviewed; the dashboard warns, never
blocks. Public policies are listed on `/<ns>` and at
`/<ns>/<integration>.policy.<name>`; copying makes the installer's own copy
(`copied_from_*`), which only gets an "update available" note. Only org
owners write policies. A policy attached to a grant can't be deleted.

**Personal accounts** (`organization.kind = 'personal'`, the user's
`@username`; the other kind is `'organization'`, never "team") have exactly one owner, forever: nobody can be invited or
promoted to owner there, and only the owner invites. Others help inside a
workspace (`workspace_member`). To share ownership, the owner transfers
the workspace to an organization (`lib/transfer.ts`): connections move and get
new URLs; the old URL stays as a `connection_alias`, keeps working, and
every result carries a "moved" notice. Policies the workspace uses are
copied into the organization.
OAuth binds a sign-in to a connection through RFC 8707 `resource`: each
connection has its own protected resource document at
`/.well-known/oauth-protected-resource/<org>/mcp/<name>/<id>`, whose
`resource` is exactly the connection URL, so a token only works on the URL
it was issued for. A workspace's first connection is created automatically
with its first instance (`primaryConnection`).

The bare `/mcp` endpoint is **gone**, and so is the old `/c/<org>/...`
connection URL (`/c/` is reserved for collections). Every token belongs to
exactly one connection. `instance_grant` (the old per-agent permissions)
is no longer consulted by the MCP path; the per-agent matrices still shown
on the agent and instance pages are leftovers to remove.

**Activity: requests and calls.**
`zeqqat_search`, `zeqqat_describe` and `zeqqat_run` require a one-line
`reason` (what the user asked for, worded the same on every call for one
request); without it the call is refused and nothing is logged. whoami,
policy and docs take it optionally. `lib/requests.ts` groups calls into an
`agent_request` row by person + agent (OAuth client) + exact reason within
30 minutes (public connections: by connection), not by MCP session, so one
request can span connections. `call_log` is append-only: a call to an app is
inserted as `running` before the request goes out and updated once with
its outcome. Each row also records, at call time, the instance alias, the
caller's role, the policy name and version, the spec release and the
outbound request (`describeOutbound`: method, url, query or body, headers
with the credential's value never stored). The dashboard reads it through
`lib/activity.ts`, per viewer (only workspaces they can open in the current
org): `/app/activity` (request cards), `/app/activity/<requestId>` (the
request's calls, lookups as quiet lines), `/app/activity/call/<callId>`
(one call: request, response, details), `/app/activity/<id>/export` (JSON).
Rows from before reasons existed show as single-call cards.
`tests/e2e/activity-seed.ts` runs the whole flow locally against a
throwaway Postgres and a stand-in Dokploy.

**Install telemetry** (`lib/telemetry.ts`): a self-hosted install sends
`{ installId, version }` to `https://zeqqat.com/api/telemetry` on start and
daily (`install_identity` holds the random id). Only the cloud edition
accepts pings (`app/api/telemetry`, into `telemetry_install`, no IP stored).
Off with `ZEQQAT_TELEMETRY=0` or `DO_NOT_TRACK=1`, and never in dev or the
cloud edition. Never add a field to the ping without updating the README's
"Anonymous install ping" section: what is sent is a promise to self-hosters.
The **operator stats API** (`/api/operator/*`, `lib/operator.ts`) serves
read-only sign-up, usage and install numbers to the operator's dashboard,
which reads it through Zeqqat itself (import `/api/operator/openapi.json`
as an app). Off (404) unless `ZEQQAT_OPERATOR_KEY` (32+ chars) is set;
every call but the spec needs it as a Bearer token. No dashboard UI lives
in the app.
`pnpm exec tsx tests/e2e/telemetry-flow.ts` runs the ping loop end to end.

**Public site** (cloud edition only; self-hosted redirects into `/app`):
`/` and `/integrations` share `components/SiteChrome.tsx`. The apps listed
on `/integrations` and in the landing page's "Works with" row come from
`lib/integrations-directory.ts`. Only list a spec app after running its
spec through the importer: specs over 15 MB (Cloudflare's), Swagger 2 files
and GraphQL-only APIs don't import. "Add" links go to
`/app/integrations?add=app&spec=...` (the import form, filled in), through
`/signup?next=...` when signed out (`lib/next-path.ts` keeps `next` on-site).

**Agent docs** live in `lib/agent-docs.ts`: `zeqqat_docs` ranks them with
Postgres full-text search, and they're public at `/docs/agents/<page>`
(each passage links to its `#section`).

**Scope right now:** Dokploy only, HTTP tools only. Workflows,
collections, other integrations, custom connection domains, community
tools and guest access are planned but not built. Open an issue to
discuss one before starting on it.

**OAuth-as-provider**: Zeqqat is itself an OAuth 2.1 authorization server
for connecting agents (RFC 7591-adjacent, but see the CIMD note below), not
just an OAuth *client* of Google. `oauth_client` / `oauth_grant` /
`oauth_token` / `oauth_authorization_code` model that. `call_log` records
every tool invocation — request args and response body (capped, and
already scrubbed — see below) — for the Activity/Agents/Instances detail
views.

## MCP tool naming

`lib/tool-names.ts` is the single source of truth for
building and parsing names. Two kinds of names exist:

**Built-in tools** are the only tools in `tools/list`: `zeqqat_search`,
`zeqqat_describe`, `zeqqat_run`, `zeqqat_whoami`, `zeqqat_docs`. Claude's
web/desktop clients call them as `mcp__<connector>__<name>` and validate
that against `^[a-zA-Z0-9_-]{1,64}$`; a name outside it is silently
dropped (the connector shows as connected with zero tools). Build them with
`builtinToolName`, which keeps them short. The `zeqqat_` prefix is needed
because the connector name is user-chosen ("deployment" says nothing).

**Catalog tools** (imported endpoints) are never listed. Agents find them
with `zeqqat_search` and pass the raw **operationId** (`application.deploy`,
stored in `api_endpoint.name`) plus an **instance** to `zeqqat_run`. The
instance fixes the integration, so the operationId is enough. No client
name rule, length budget or hash applies. Their human-facing name is the
canonical `@org/target.type.action` (e.g.
`@zeqqat/dokploy.http.application_deploy`), used in the DB, UI, logs and
page URLs, and accepted by `zeqqat_describe` / `zeqqat_run` too (workflows
will run by canonical name, since they have no instance).

- Segments are lowercase snake_case; `-` and `.` never appear inside one.
- `type` is `http` or `workflow` (only `http` is in scope). For HTTP tools
  `target` is the integration's slug (`dokploy`).
- No version in names agents pass. Catalog names are looked up fresh each
  session; breaking changes surface through the instance's spec
  (`pinned_snapshot_id`).
- `api_endpoint.action` is the sanitized operationId, written once at
  import by `compileEndpointName`, never shortened. Collisions get `_2`,
  `_3` at import.
- `lib/catalog.ts` resolves the operationId, canonical and dotted forms.
  `zeqqat_describe` without an instance errors if two integrations share an
  operationId and lists the canonical names to choose from.

**Security:** each instance is tied to exactly one integration (tool set),
chosen by a person when the instance is added. The agent never picks whose
tool definitions run against a server.

## What the model sees (context delivery)

Clients differ: some drop server `instructions`; some show a result's
`content`, others its `structuredContent` (Claude Code: structuredContent on
success, content on errors). So the context object (`lib/mcp-context.ts`:
`account` (`username` + `type`: `personal` | `organization`, the account
that owns the connection), workspace, connection, integrations as
`@author/slug` with `toolCount`, their instances and a `policySummary`, a
"not connected" hint, the sunset notice) goes in `instructions`, in the first `content` block of every
result, and in `structuredContent.context`. Every tool description points
to `zeqqat_whoami`, whose result is the full context: every instance, plus
each integration's `categories` (distinct first spec tag of its live
endpoints). Other results and `instructions` leave categories out to stay
small. Every built-in declares an `outputSchema`
(`{ context, result }`; `zeqqat_run`'s result is any JSON). JSON keys the
agent sees are camelCase; Postgres columns stay snake_case.

## Auth for connecting agents: CIMD, not DCR

Client identification uses [Client ID Metadata
Documents](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
— a client's `client_id` is an `https://` URL to its own self-hosted
registration document, fetched and validated live on every
`/oauth/authorize` request. Dynamic Client Registration
(`POST /oauth/register`) was removed. This is a deliberate choice for this
server specifically (every client that matters — Claude's hosted surfaces,
Claude Code — already supports CIMD), not a claim that DCR is deprecated
generally.

Two things a naive CIMD implementation gets wrong:
- The document's own `client_name` is self-asserted and must never be
  trusted as the relying-party identity — the consent screen shows the
  `client_id` URL's **host** instead, computed server-side.
- Native clients (Claude Code) use loopback redirect URIs with no fixed
  port (RFC 8252 §7.3) — `validateRedirectUri` matches loopback host+path
  with the port ignored, in addition to exact match.

## Secret handles

Agents never see secrets, and still have to move them (a new database's
password into an app's `DATABASE_URL`). `lib/secret-handles.ts` does it:

- A secret found while scrubbing a response becomes `{{zq_secret_<16>}}`
  instead of `[redacted by zeqqat]` (`HandleMinter`, passed to
  `scrubSecrets` by the executor). Same value, same handle.
- `zeqqat_secret` mints a handle for a fresh random value (`password`,
  `base64` or `hex`). Read-only callers can't.
- A handle in a `zeqqat_run` input, alone or inside a string, is filled in
  by `resolveHandles` right before the request goes out. The call log,
  Activity and the outbound record keep the handle, never the value.
- Rules: the handle's connection only; one instance (its source, or the
  first one a generated handle is used on); only in env blocks or
  secret-named fields (`secretField`), never in URLs, descriptions or
  notification targets; 30 minute TTL (`HANDLE_TTL_MS`), after which the
  `secret_handle` row is deleted. Values are stored AES-256-GCM encrypted.
- `tests/unit/secret-handles.test.ts` covers the pure parts;
  `pnpm exec tsx tests/e2e/secret-handles-flow.ts` runs the whole loop
  (mint, create a database, wire its URL into an app) against a real
  Postgres and a stand-in Dokploy.

## One-button self-host install

`/app/self-host` installs Zeqqat into a workspace's Dokploy with the key
the instance already holds: no agent, because the steps never change.
`lib/selfhost-install.ts` is the steps (project, compose service from
`lib/selfhost-compose.ts`, Dokploy's free sslip.io address, fresh secrets
straight to Dokploy, deploy, poll, then `checkAddress`);
`lib/actions/selfhost.ts` wraps them with `requireOwner`; the page runs
them in order and shows each one. Secrets never reach the browser.
`deploy/dokploy/docker-compose.yml` (the Dokploy template) must equal
`SELFHOST_COMPOSE` (a unit test checks), and the template follows `latest`,
so a release needs no template PR.
`pnpm exec tsx tests/e2e/selfhost-install-flow.ts` runs the steps against a
stand-in Dokploy.

## Versions, What's new and in-app updates

**Every version bump adds an entry on top of `content/changelog.json`**
(version, date, a few plain lines of what changed, no em dashes). A unit
test fails while the top entry isn't `package.json`'s version. The same
entry becomes the GitHub release notes (`release.yml`).

The side menu footer shows only `v<version>` and one pill: `Latest`, or
`Update available` (never the newer number; that's inside the modal).
`components/VersionPill.tsx` opens the What's new modal (every version,
newest first, scrolls) with a link to `/app/whats-new`. zeqqat.com serves
its changelog at `/api/releases`; a self-hosted install fetches it hourly
(`lib/changelog.ts`, `ZEQQAT_RELEASES_URL` to point elsewhere,
`ZEQQAT_UPDATE_CHECK=0` to stop) to learn about newer versions. Cloud is
always Latest.

Update now (self-hosted, workspace admins): `lib/self-update.ts` looks
through the admin's Dokploy instances for the compose whose
`ZEQQAT_PUBLIC_URL` or domain is this install's own host, then
`compose.deploy`s it; the image is `latest` with `pull_policy: always`, so
that is the update. A compose pinned with `ZEQQAT_VERSION` is reported, not
deployed. The modal then polls `/api/health` (which returns `version`)
until the new version answers and reloads. Only forward to latest: no
version picker, because an older build can break on a database a newer one
already migrated.

## Reachability check

`zeqqat_check` (`lib/reachability.ts`) answers what an agent's sandbox
can't: does an address load from the internet (`live`,
`certificate_not_ready`, `error_page`, `unreachable`, `not_found`), or is a
port open on a Dokploy instance's public IP (from `server.publicIp`; only
22, 80, 443 and 3000, so it never becomes a port scanner). It returns an
outcome, never a page body, and never touches private, loopback or
link-local addresses: the IP is resolved once, checked, and the connection
pinned to it. On zeqqat.com it's the open internet; on a self-hosted
install it may be the very server being checked, and the result says so.
The self-host guide's agent note depends on it: never report "live"
without a `live` check.

## Security posture

- Credentials are AES-256-GCM encrypted (`lib/crypto.ts`) before they ever
  reach a database row, and never returned by any read path.
- Every response from an upstream API is scrubbed (`lib/scrub.ts`) for
  secret-shaped values before it reaches an agent or gets logged —
  upstream APIs sometimes return more than they should (see
  `lib/scrub.ts`'s own comment for the concrete example this was built
  for). Check `scripts` via `pnpm test` — `tests/unit/scrub.test.ts` is the
  regression guard; it checks both directions (secrets caught, ordinary
  identifiers survive).
- Rate limiting is Postgres-backed (`rate_limit_bucket`, fixed-window,
  atomic upsert) — durable across replicas and deploys, not an in-memory
  `Map`.
- CSP is nonce-based per request (`proxy.ts`), not `'unsafe-inline'`.
- Connection URLs require a valid bearer token on **every** method,
  `initialize` included (public connections and cut-off ones excepted) — there is no free preview, since every tool needs
  real workspace context to mean anything. A `401` with a proper
  `WWW-Authenticate` header is what makes Claude's client show "sign in
  required" at all; a `200` wrapping a JSON-RPC error is invisible to that
  detection.

## Contributing

- Read `db/schema.ts` end to end before touching the domain model — the
  comments explain *why*, not just *what*.
- New tool names must go through `lib/tool-names.ts`. Anything else gets
  silently dropped by Claude's clients (this happened once already).
- Run `pnpm check` before opening a PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
