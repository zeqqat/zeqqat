# Zeqqat

One MCP endpoint for every tool you've connected. An agent (Claude, or any
MCP-speaking client) signs in once via OAuth, then reaches every
integration (Dokploy today, more over time) through a few stable built-in
tools (`zeqqat_search`, `zeqqat_describe`, `zeqqat_read` / `zeqqat_create` /
`zeqqat_edit` / `zeqqat_delete`, `zeqqat_whoami`,
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
- **http or https, sign-in works.** A self-hosted install is often served
  over plain http while `ZEQQAT_PUBLIC_URL` says https (Dokploy's template
  creates the domain with no certificate). `lib/auth.ts` builds the Better
  Auth setup per base URL and `authForRequest` picks the flipped-scheme
  one when a request reaches the install's own host on the other scheme
  (`lib/auth-scheme.ts`, from `X-Forwarded-Proto`). Anything reading the
  session goes through `getServerSession` or `authForRequest`, never
  `auth.api` directly. `pnpm exec tsx tests/e2e/http-https-signin.ts`.
- **Turn on HTTPS.** Over http on a self-hosted install, the app shows a
  banner (`components/HttpsBanner.tsx`): agents like Claude need https. A
  workspace admin whose Dokploy runs the install gets a button
  (`lib/actions/https.ts`, `lib/self-https.ts`): Let's Encrypt on the
  domain, `ZEQQAT_PUBLIC_URL` to https, redeploy, then the page waits for
  https and moves there. `lib/admin-targets.ts` (decrypted Dokploy keys)
  must stay out of "use server" files.
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

**MCP URL, not connection.** What the code calls a `connection` (table,
files, `lib/connections.ts`) is an **MCP URL** everywhere a person or an
agent reads it: the dashboard (`<ws>/mcp-urls`), tool descriptions, errors, the context (`mcpUrl`), the docs
and the plugin. "Connection" was misleading: a URL is not connected to
anything until someone pastes it into an agent. People whose agent signed
in through one are "connected".

**Dokploy Instances, not integrations, in the UI.** The menu item is the
Dokploy logo plus "Dokploy Instances" (`<ws>/dokploy-instances`, instances
grouped under their app; one instance's page is
`<ws>/dokploy-instances/<id>`). "Integration" is the code's
word for a published tool set (`@zeqqat/dokploy`), not a menu label: people
think "my Dokploy", not "my integration". Once Zeqqat leaves the Dokploy
ecosystem the page becomes "Apps", each app listing its instances or
accounts. The page is one list (`components/InstanceCards.tsx`,
`lib/instance-cards.ts`), headed like the MCP URLs page: the instance
count on the left ("1 instance", "2 instances"), "Add an instance" on the
right, then a card per instance. **One instance's page**
(`components/InstancePage.tsx`, data in `lib/instance-page.ts`) opens with
the same card (its period switch drives the whole page), then four tabs:
MCP URLs (the URL cards that reach it, each with a shield-tick line naming
the policy it applies there, or "Default policy"), Calls (one card per call:
person, tool with kind and duration, then agent, MCP URL and outcome as
pills; "All" plus a sliders filter of Status, MCP URLs and People, chosen
filters shown as pills that merge into icon + count when they don't fit),
Connected (people through any of those URLs) and Manage (added by, URL,
version with Update via Dokploy's `settings.updateServer`, key, last checked,
secrets, remove with the name typed to confirm). Access belongs to an MCP
URL, so there is no per-instance "what agents can do". Lines shrink only when
they would overflow, never at a fixed width. A card pairs three rows per side:
name / calls graph, domain / calls with the period switch, MCP URLs and
people connected / a grey version pill. Health is the ring around the app's
logo (mint, or amber with a warning mark). When Dokploy's own update check
(`settings.getUpdateData`) has a newer release, a faint amber line sits
under the changed part of the version (`lib/version-diff.ts`) and a click
says one line ("Dokploy v0.31.4 is out"); updating belongs on the
instance's page, never on the list. The page re-checks a Dokploy older than
10 minutes and its latest release (cached 30 minutes), but never waits more
than 3 seconds for them. Tabs (`.zq-mu-tabs`, `.zq-tabbar`) never wrap onto a
second line or squeeze into each other: they stay on one line and scroll
sideways. Never label anything "Service": Dokploy uses "service" for an
app or database inside a project, so the word is ambiguous to users and
agents.

**Dokploy integrations.** An integration is the list of tools that reach an
instance (`@zeqqat/dokploy`), so its pages never show an instance name on
the card: several instances can use one. The workspace menu's "Dokploy
integrations" (`<ws>/dokploy-integrations`) lists the integrations its own
instances use; the account level (`/<username>/dokploy-integrations`) lists
those of every workspace the viewer can open, plus any the account
published, with "+ Add integration". Both use `components/IntegrationViews.tsx`
(data in `lib/integrations.ts`, scope in `lib/integration-scope.ts`). A card
is the logo, `@org/slug`, the version far right (the newest snapshot's
`release`), the tool count and the kind counts. One integration's page has
Tools (search, a sliders filter of kinds shown as coloured pills with
counts, under the search after All), Instances (each instance in scope, its
Dokploy version, and how its own API compares) and About (published by, and
"Built from", which opens the saved spec at `.../<id>/spec`). The publisher
(an owner of the integration's org) edits a tool's description and kind in
place (`kind_source` / `summary_source` = `accepted`, which imports never
overwrite); anyone else's edit becomes a suggestion in the publisher's
review queue (`<ws>/feedback`). `<ws>/tools` redirects to the workspace page.

**An instance's own API.** Dokploy builds its OpenAPI document at runtime
(`settings.getOpenApiDocument`), and it can list operations the spec file
in Dokploy's repo doesn't (v0.31.2 serves `application.deployNginxQuickstart`;
the repo file at the same tag, which is byte for byte the bundled catalog
spec, doesn't). `freshDokploy` reads it every few hours or when the version
changes (`lib/instance-spec.ts`, `instance.spec_ops`). The Instances tab
and the instance's Manage tab compare it with the integration: tools the
instance has that the integration doesn't stay off until the publisher
reviews them (the publisher sees "N new tools ... not activated. Review
them first", listed at `?tab=new`); tools the integration has that an
older Dokploy doesn't get an "Update Dokploy" link. Nothing here makes a
tool callable: activating one still means adding it to the catalog.

**Connect Dokploy first.** Until a workspace has its first instance,
everyone in it can open only the overview and Releases
(`lib/setup-gate.ts`). `components/AppFrame.tsx` decides, `components/AppShell.tsx`
applies it: a menu click opens a modal instead of navigating, and a
held-back page opened by its address goes to the workspace overview with the same modal.
An admin is told to connect Dokploy; anyone else can't, so the modal names
the admin to ask (`firstAdminOf`, "Name @username"). It is a nudge, not
access control: the server actions keep their own checks.
`tests/e2e/connect-first.spec.ts` covers the admin side.

**Accounts and the path switcher.** An account is a personal account
(`organization.kind = 'personal'`, created at sign-up, its slug is the
user's username, one owner forever) or an organization. **An account can
have no workspace.** Sign-up and "+ New organization" make the account
only; its first workspace comes from Setup (`/<username>/setup`) or the
account page. `requireAccount` (`lib/guard.ts`) serves account pages
whether or not a workspace exists; never create a placeholder workspace
to satisfy a check. The top bar's path
is the switcher (`components/PathSwitch.tsx`): one click on `@username` or
the workspace opens a list whose first row opens it ("Open ›"), then the
others to switch to, then + New. Your own account is first, with a "you"
pill, then "Organizations". People are circles, organizations rounded
squares. Each account has its own level at `/<username>` (Workspaces,
Members, Settings, `lib/accounts.ts`), with its own side menu; everything
under `/<username>/<workspace>` is one workspace (see **Dashboard URLs**).
Switching (`openAccountAction`, `switchWorkspaceAction`) just goes to the
other URL; the `zq_org` / `zq_ws` cookies are only a fallback. A personal
account has members too (people in its workspaces), but nobody else can
ever be its owner.
`pnpm exec tsx tests/e2e/accounts-seed.ts` runs it locally with three accounts.
A workspace's Settings (`app/[org]/[ws]/settings/page.tsx`, head in
`components/SettingsHead.tsx`, `.zq-st-*` CSS) is one card: workspace name,
`@account / workspace` (the lowercase address part) and icon counts
(instances, MCP URLs, people, policies used; no graphs), then tabs: General
(Workspace name, Address), Transfer (personal accounts only) and Delete
(owners, when the account has another workspace). The top path shows the
workspace's address part (`slug`), not its display name.
An account's Settings (`app/[org]/(account)/settings/page.tsx`) uses the same
card (avatar, name, @username, counts of workspaces, people, instances, MCP
URLs, policies). Organization owners get Organization name, Username (old
one kept as a `username_alias`) and a Delete tab (`lib/actions/org-settings.ts`);
delete is refused while the organization publishes integrations or other
accounts' MCP URLs use its policies. A personal account's name and username
link to /account.

**Members pages** (`components/Members.tsx`, `components/members.css`,
`lib/members.ts`, `lib/actions/members.ts`). A workspace member is always
someone in the account given access to that workspace. Lists are for
recognizing and opening a person; roles, Owner and removal live on the
person's page. `/<username>/members`: everyone in the account (you, then
owners, then the rest) with their workspaces (owners show "Owner": they're
admins everywhere), then open invites. `/<username>/members/<them>`:
Workspaces (role per workspace, a select that saves on change, "Remove" as
its last option; "+ Add to a workspace") and Manage (who added them, from
the invite they accepted; Owner toggle, organizations only, the creator
stays one; Remove from the account). `<ws>/members`: role, calls this week
and connected agents per person; ⓘ explains roles; "+ Add member" adds
someone from the account or creates an invite link. `<ws>/members/<them>`:
Calls (the Activity `RequestCard`s, used as they are), MCP URLs (connected
through, calls this week), Manage (role, "In @account ›", remove from the
workspace). Every action names its workspace or person and re-checks the
caller: workspace admins for a workspace's members, owners for the account.

**Dashboard URLs** (`lib/paths.ts`), like Twitter and GitHub. Below, `<ws>`
means `/<username>/<workspace>`.

- `/<username>`: one URL for everyone. Someone in the account sees its
  workspaces (the account level, `app/[org]/page.tsx` +
  `app/[org]/account-home.tsx`); anyone else, signed in or not, sees the
  public page (what it publishes).
- `/<username>/members`, `/settings`, `/dokploy-integrations`, `/policies`:
  the account's own pages (`app/[org]/(account)/`).
- `<ws>` and `<ws>/...`: one workspace's pages (`app/[org]/[ws]/`). A dotted
  second segment is a tool or policy page instead (`app/[org]/[ws]/page.tsx`
  dispatches to `tool-page.tsx`); workspace slugs never have dots.
- `/account`: your own profile.
- There is no `/app`. Signed in, you start on your own account page,
  `/<username>` (`homePathFor` in `lib/workspace.ts`): after sign-in (with
  no `?next=`, `/signin` sends a signed-in person there), from a self-hosted
  install's home page, and from every "Dashboard" link.
- MCP URLs stay `/<username>/mcp/<name>/<id>`, never with a workspace in
  them, because an MCP URL can move between workspaces.

`proxy.ts` reads the account and workspace off the path (`placeOf`) and
passes them on as `x-zq-org` / `x-zq-ws` (always overwritten, never taken
from the client). `requireWorkspace` uses them: a workspace the person can't
open is a 404, an old username redirects to the new one. Pages and actions
build links with `here("/policies")` / `hrefIn(ws, ...)` (`lib/guard.ts`);
client components with `useBase().ws` (`components/DashboardBase.tsx`).
Never hard-code a dashboard path in a link. Workspace slugs can't be an account
page's name or another reserved word (`RESERVED_WORKSPACE_SLUGS`).

**Org → workspace → connection** is the access model:

- **`organization`** owns members (`membership`, `owner` | `member`) and
  gives every URL its brand. Its slug is lowercase snake_case
  (`acme_corp`), globally unique, and never one of the reserved words in
  `lib/username.ts` (they are the app's own top-level routes). Org owners
  are admins of every workspace.
- **`workspace`** splits an org by team (Engineering gets deploy tools,
  Marketing gets social). It holds its own instances (keys), connections
  and members (`workspace_member`, `admin` | `member` | `viewer`).
  Workspaces never appear in an MCP URL or tool name (the token decides
  which workspace a caller is in); they are the second part of the
  dashboard's page URLs.
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
blocks. **Policies pages** (`components/PolicyViews.tsx`, `components/PolicyClient.tsx`,
data in `lib/policy-pages.ts`): policies belong to the account, so they are
made and edited at `/<username>/policies` (every policy the account owns,
used or not, plus "+ New policy" for owners); `<ws>/policies` lists only the
ones used in that workspace, and each opens in the workspace
(`<ws>/policies/<id>`, Map limited to that workspace's MCP URLs; the same
page as the account's, `components/PolicyPage.tsx`, and edits return there). A card is the
full name (`@acme/dokploy.policy.` dim, the name bold, opening scrolled to
its end when it doesn't fit) with the version, the Read / Create / Edit /
Delete pills as allowed/total (they scroll sideways on a phone, never shrink),
and "2 MCP URLs · 1 instance". Default policy is always first and has its own
page (`/policies/default`: Map, read-only MCP tools). A policy's page has Map
(each MCP URL → shield + calls in the last 7 days under this policy, from
`call_log.policy_name` → instance), MCP tools (search plus a "Show" filter:
All stands alone, Allowed / New / kinds add up, removing the last pick
brings All back; toggles for owners, a save bar "Save as vN") and Manage
(new MCP tools to review first, with a blue dot on the tab; created by,
name, what agents read, public, workspaces, integration, delete).
Public policies are listed on `/<ns>` and at
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
is no longer consulted by the MCP path; the per-agent matrix still shown
on the agent page is a leftover to remove.

**Activity: requests and calls.**
`zeqqat_search`, `zeqqat_describe` and the run tools require a one-line
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
org): `<ws>/activity` (request cards), `<ws>/activity/<requestId>` (the
request's calls, lookups as quiet lines), `<ws>/activity/call/<callId>`
(one call: request, response, details), `<ws>/activity/<id>/export` (JSON).
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

**Public site** (cloud edition only; a self-hosted install's `/` goes to `/signin`, which takes a signed-in person to `/<username>`):
`/` and `/releases` share `components/SiteChrome.tsx`. There is no public
integrations page: Zeqqat is the MCP for Dokploy, and the list of apps lives
only in the dashboard (`<ws>/dokploy-instances`). A link can still fill the
import form in (`<ws>/dokploy-instances?add=app&spec=...`), through
`/signup?next=...` when signed out (`lib/next-path.ts` keeps `next` on-site).

**SEO:** every public page gets its title, description, canonical URL and
share card from `pageMeta()` in `lib/seo.ts`, and is listed in
`app/sitemap.ts`. A sitemap date is when the page itself last changed:
posts use `date` (or `updated` in frontmatter), other pages
`content/lastmod.json` (`lib/lastmod.ts`, refreshed by `pnpm bump`; a
unit test fails while it is stale). `/rss.xml` is the blog feed, also
listed in robots.txt as a sitemap. Share images come from `lib/og-image.tsx` (one for the
site, one per blog post). Sign-in, password, invite and consent pages are
noindex. Blog posts never name the author's own hostnames, projects or
databases.

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
`zeqqat_describe`, `zeqqat_read`, `zeqqat_create`, `zeqqat_edit`,
`zeqqat_delete`, `zeqqat_whoami`, `zeqqat_docs`. **One run tool per kind**
(`RUN_KINDS` in `lib/mcp-tools.ts`), so an agent's own per-tool settings
("always allow" reads, "ask" for edits) line up with Zeqqat's kinds and each
tool's annotations are true (read is read only, delete destructive).
`tools/list` lists only the kinds the caller may use somewhere on the MCP URL
(`allowedKinds` in `lib/mcp-context.ts`). Search and describe give each tool's
`runWith`; the executor refuses a tool sent through another kind's run tool
and names the right one. The old `zeqqat_run` answers with that explanation.
Claude's
web/desktop clients call them as `mcp__<connector>__<name>` and validate
that against `^[a-zA-Z0-9_-]{1,64}$`; a name outside it is silently
dropped (the connector shows as connected with zero tools). Build them with
`builtinToolName`, which keeps them short. The `zeqqat_` prefix is needed
because the connector name is user-chosen ("deployment" says nothing).

**Catalog tools** (imported endpoints) are never listed. Agents find them
with `zeqqat_search` and pass the raw **operationId** (`application.deploy`,
stored in `api_endpoint.name`) plus an **instance** to the run tool for its kind. The
instance fixes the integration, so the operationId is enough. No client
name rule, length budget or hash applies. Their human-facing name is the
canonical `@org/target.type.action` (e.g.
`@zeqqat/dokploy.http.application_deploy`), used in the DB, UI, logs and
page URLs, and accepted by `zeqqat_describe` and the run tools too (workflows
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
`currentAccount` (`username` + `type`: `personal` | `organization`, the
account that owns the MCP URL, not necessarily the caller; inside it
`workspace` with its `name` and the `mcpUrl` as `name`, `id` (short id)
and `url`), integrations as
`@author/slug` with `toolCount`, their instances and a `policySummary`, a
"not connected" hint, the sunset notice) goes in `instructions`, in the first `content` block of every
result, and in `structuredContent.context`. Every tool description points
to `zeqqat_whoami`, whose result is the full context: every instance, plus
each integration's `categories` (distinct first spec tag of its live
endpoints). It also leads with `zeqqat` (`version`, `latest`,
`updateAvailable`, from `releaseStatus` in `lib/changelog.ts`), then
`currentUser` (the caller's `name` and `username`, never their email; null
on a public MCP URL), `currentAccount.dashboard` (the account's page) and
`currentAccount.workspace.dashboard` (the workspace's page), full
addresses so the agent can hand the person a link.
**Tool list changes are announced.** Zeqqat declares `tools.listChanged`.
With no standing stream to push on (GET is 405), the answer to an agent's
next `tools/call` after its list changed (an update, a policy change)
becomes an event stream: `notifications/tools/list_changed` first, then the
result (`lib/tools-changed.ts`, `tools_seen` keyed by MCP URL + person +
agent). Once per change; clients that don't accept `text/event-stream` just
get the result.
**Agents on an old list are shown and nagged, never blocked.** Every
`tools/call` notes the list the agent would get now (`tools_seen.current`);
when it differs from the list it last fetched, the agent is behind. Its
result then carries a context `notice` telling it to have the person
reconnect Zeqqat in that agent. The person sees a banner on every dashboard
page ("Your agent has an old Zeqqat tool list", a click lists which agent on
which MCP URL: `components/StaleToolsBanner.tsx`), and the MCP URL page's
Connected tab marks that agent with a faint amber line and a one-line tip.
Tracked per MCP URL + person + agent; it clears once the agent fetches the
new list. Calls still run: only the person can reconnect.
Other results and `instructions` leave categories, `currentUser` and
`dashboard` out to stay small. Field descriptions live in the context's
JSON Schema (`CONTEXT_SCHEMA` in `lib/mcp-server.ts`), but clients don't
reliably show `outputSchema` to the model, so whoami's tool description
also says what `currentUser` and `currentAccount` are. Every built-in declares an `outputSchema`
(`{ context, result }`; the run tools' result is any JSON). JSON keys the
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
- A handle in a run tool input, alone or inside a string, is filled in
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

`/<username>/self-host` (account owners; Dokploy instances belong to the
account) installs Zeqqat into the account's Dokploy with the key the
instance already holds: no agent, because the steps never change.
`lib/selfhost-install.ts` is the steps (project, compose service from
`lib/selfhost-compose.ts`, a Dokploy API key of the install's own
(`user.createApiKey`, prefix `zqself_`, null on a Dokploy that can't, then
the install gets a copy of the same key), Dokploy's free sslip.io address,
fresh secrets straight to Dokploy, deploy, poll, then `checkAddress`);
`lib/actions/selfhost.ts` wraps them with `requireOrgOwner`; the page runs
them in order and shows each one. Secrets never reach the browser (the new
key travels between steps sealed with this site's encryption key).
The page is centered: the headline, then one card listing what gets
installed (Dokploy instance and its URL, Project, Installs, Address,
Comes with you, Takes) and the button. The address is asked from Dokploy when the page
opens (`installPreview`, `domain.generateDomain` creates nothing), the
project is named after it (`projectNameFor` in `lib/selfhost-names.ts`:
"Zeqqat | ....ab12cd-13-53-192-23.sslip.io") and the install uses exactly
that address. "the key it already has" opens the key's summary: its
prefix and last 4 characters (`instance.key_hint`, `lib/key-hint.ts`, set
whenever a key is saved and filled in on start for older keys), never more.

**The handoff (seed and claim).** Self-hosting from zeqqat.com only exists
to get someone started fast; the self-hosted install is a separate account
and nothing on zeqqat.com is moved or deleted. `installConfigure` writes
`ZEQQAT_SEED` (`lib/selfhost-seed.ts`) into the new install's env: the
owner (email, name, their personal username), the workspace(s) using the
instance, the instance with its new key encrypted with the install's own
`ZEQQAT_ENCRYPTION_KEY`, the compose id, and only the SHA-256 of a claim
token. Never MCP URLs (they are new URLs, made there) or policies. "Open
your Zeqqat" is `<address>/claim/<token>` (`app/claim/[token]`): while the
install has no users and a seed, the owner account can only be made with
that token and the seeded email (`x-zeqqat-claim`, `passwordSignUpAllowed`),
so nobody who finds the fresh address first takes it. The claim form is
email, setup token and password (no name: it comes from the seed). From the
link the email and token are filled in; opened any other way, `/signin`
shows the same form empty, with a link to the owner's Self-host page on
zeqqat.com where the token is copied (`components/AuthCard.tsx`).
**Own domains while unclaimed:** people often add their own domain in
Dokploy (their server doesn't take ports 80/443), so while the install waits
to be claimed it accepts sign-up on any domain its compose has in Dokploy
(`lib/own-domains.ts` asks its own Dokploy with the seed's key, cached 30 s;
`authForRequestAsync` in `lib/auth.ts` builds a sign-in setup for that
origin). Claiming on such a domain makes it the install's address: the
claim sets `ZEQQAT_PUBLIC_URL` to it in the compose's env and redeploys. Making it runs `applySeed` (`lib/seed-claim.ts`):
username, instance, workspace(s) with the instance, so Setup opens at
"Connect your agent"; then the seed is removed from the compose's env in
Dokploy. Once anyone exists the seed is ignored.
`pnpm exec tsx tests/e2e/selfhost-claim-flow.ts` runs it.

**The page after the install.** The install card folds into one line
("Installed on production", click to open), then one card: the owner (avatar;
name and @username on one line, the Owner pill under them), every address the
install has (its compose's domains in Dokploy, each checked from the
internet, asked again every few seconds while the page is on screen:
`installAddresses`, `lib/selfhost-addresses.ts`), the setup token with Copy,
and Open your Zeqqat, which opens the first address that loads (its
`/claim/<token>`) and waits while none does. Not reachable never stops the
flow.

**The old key.** Asked only after the claim, because deleting it before the
owner is in their own Zeqqat would cut them off. The seed carries a hint of
zeqqat.com's key (`cloudKey`); the claim saves a `cloud_handoff` row on the
install, and the first thing the owner sees after signing in there (Setup)
is "The key zeqqat.com uses" (`components/CloudKeyCard.tsx`): Keep it (the
default: people staying on zeqqat.com is what we want) or Delete the key.
The install sends the choice with the claim token to zeqqat.com
(`app/api/selfhost/key`, `lib/cloud-key.ts`), which does the work with its
own key. The same choice sits in zeqqat.com's Settings, Self-host tab, for
claimed installs (`CloudKeyPanel`). Dokploy can't switch a key off, only delete it, and
never says which key is calling, so `lib/dokploy-keys.ts` finds it: Dokploy
stores each key's SHA-256 (base64url, no padding: `@better-auth/api-key`
1.6.23's `defaultKeyHasher`) and `user.getBackups` returns it, so we hash
the key we hold and match exactly; without hashes (non-admin keys), the
longest prefix the key starts with; still ambiguous, the owner picks. The
key then deletes itself (`user.deleteApiKey`). This is Zeqqat's own code
with the owner clicking, so no agent policy applies. The instance stays:
its stored key is wiped, `instance.key_deleted_at` / `key_deleted_for` keep
the log on its Manage tab ("Deleted from your Dokploy on <date>, when you
moved to <host>"), the ring says "Key deleted", calls are refused, and
Replace key brings it back.

**The saved install.** Every install is a `selfhost_install` row
(`lib/selfhost-installs.ts`): the address, the claim token encrypted (and
its hash), whether it got its own key, and the key choice. The page shows
the latest one again after a reload (claim link while unclaimed). On claim,
the install posts only the token to `<zeqqat.com>/api/selfhost/claimed`
(`seed.report`), which sets `claimed_at` and always answers 204. The account
menu shows Self-host while an install is unclaimed and for 7 days after its
claim; the account's Settings has a Self-host tab with every install (the
claim link for unclaimed ones, Open for the rest) and Install another.
`pnpm exec tsx tests/e2e/selfhost-saved-flow.ts` covers it.
`deploy/dokploy/docker-compose.yml` (the Dokploy template) must equal
`SELFHOST_COMPOSE` (a unit test checks), and the template follows `latest`,
so a release needs no template PR. The first template (still on
templates.dokploy.com until Dokploy redeploys that site) pinned `0.1.0`
with GitHub sign-in and empty keys: the release workflow moves `0.1.0`
along with `latest`, a self-hosted install with no usable sign-in method
falls back to password, and Update now swaps that old compose file for
`SELFHOST_COMPOSE` before deploying.
`pnpm exec tsx tests/e2e/selfhost-install-flow.ts` runs the steps against a
stand-in Dokploy.

## Versions, What's new and in-app updates

**Bump with `pnpm bump "What changed" ["Another line"]`** (`--minor` or
`--major` for those). It sets the new version in every file that holds it
(`package.json`, `plugin/plugin.json`, `server.json`) and adds the entry on
top of `content/changelog.json` (version, date, `at` = the UTC time of
the bump, your lines). The Releases pages (not the modal) show `at` as a
time in the reader's own time zone. It refuses to
run without a changelog line or with an em dash, and warns about any other
file still naming the old version. Never bump by hand or with `npm version`.
A unit test fails while the top changelog entry isn't `package.json`'s
version. The same entry becomes the GitHub release notes (`release.yml`).

The side menu footer shows only `v<version>` and one pill: `Latest`, or
`Update available` (never the newer number; that's inside the modal).
`components/VersionPill.tsx` opens the What's new modal (every version,
newest first, scrolls) with a link to `<ws>/releases`. Tags: Latest (the
newest), New (newer than yours), Your version. The public `/releases` shows
the same list with no Your version. zeqqat.com serves
its changelog at `/api/releases`; a self-hosted install fetches it at most
every ten minutes, and right away from the Check for updates pill in the
modal and on `<ws>/releases` (`components/CheckUpdates.tsx`, `checkNow`)
(`lib/changelog.ts`, `ZEQQAT_RELEASES_URL` to point elsewhere,
`ZEQQAT_UPDATE_CHECK=0` to stop) to learn about newer versions. Cloud is
always Latest.

Update now (self-hosted, workspace admins): `lib/self-update.ts` looks
through the admin's Dokploy instances for the compose whose
`ZEQQAT_PUBLIC_URL` or domain is this install's own host, then
`compose.deploy`s it; the image is `latest` with `pull_policy: always`, so
that is the update. A compose pinned with `ZEQQAT_VERSION` is reported, not
deployed. The same Update now block (`SelfUpdate`) is in the modal and on
`<ws>/releases`. It then polls `/api/health` (which returns `version`)
until the new version answers and reloads. While it waits it shows three
real steps with a spinner and a timer (asked Dokploy, Dokploy deploying
from `composeStatus` via `getUpdateDeploy`, Zeqqat restarting), never a
percentage, and fails early when Dokploy reports the deploy as `error`.
The list of changes stays scrollable throughout. Only forward to latest: no
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
