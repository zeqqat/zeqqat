import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConsentButtons, SignInButtons, SwitchAccount } from "../../../components/ConsentControls";
import { AgentMark, agentName } from "../../../components/Marks";
import { PublicHeader } from "../../../components/PublicHeader";
import { db } from "../../../db";
import { workspace } from "../../../db/schema";
import { authorizeAction, denyAction } from "../../../lib/actions/authorize";
import { signInProviders } from "../../../lib/auth";
import { publicUrl } from "../../../lib/env";
import { getConnectionPolicy, intersect, NONE, ROLE_CAP, sunsetState, type Perm } from "../../../lib/connections";
import { connectionFromResource, getClientByClientId, validateRedirectUri } from "../../../lib/oauth";
import { clientIp, rateLimit } from "../../../lib/rate-limit";
import { getServerSession } from "../../../lib/session";
import { signInErrorText } from "../../../lib/sign-in-errors";
import { workspaceRoleFor } from "../../../lib/workspace";

// Capped host — this is the CIMD client_id URL's host, derived by us in
// lib/oauth.ts, never the document's own self-asserted client_name.
function clientHost(name: string | undefined): string {
  const fallback = "An application";
  if (!name) return fallback;
  const trimmed = name.trim().slice(0, 40);
  return trimmed || fallback;
}

// Short line for a permission set, e.g. "View, create, edit. No delete."
function describe(p: Perm): string {
  const can = [p.read && "view", p.create && "create", p.edit && "edit", p.delete && "delete"].filter(Boolean) as string[];
  if (can.length === 0) return "None yet.";
  const list = can.join(", ");
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}.${p.delete ? "" : " No delete."}`;
}

function union(perms: Perm[]): Perm {
  return perms.reduce(
    (a, b) => ({ read: a.read || b.read, create: a.create || b.create, edit: a.edit || b.edit, delete: a.delete || b.delete }),
    NONE,
  );
}

function errorPage(title: string, detail: string) {
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <div className="zq-card">
          <h1 className="zq-card-h">{title}</h1>
          <p className="zq-card-p">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function Shell({ host, children }: { host: string; children: React.ReactNode }) {
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <div className="zq-card zq-consent">
          <div className="zq-requester">
            <span className="zq-requester-mark">
              <AgentMark host={host} size={28} />
            </span>
            <span className="zq-requester-arrow" aria-hidden="true">
              →
            </span>
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
          </div>
          <h1 className="zq-card-h">Connect {agentName(host)} to Zeqqat</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

// What the token will be limited to: org, workspace, connection and, once
// we know who is signing in, what they can do there. Signed out, the role
// isn't known yet, so Access is left off.
function Scope({
  host,
  orgSlug,
  workspaceName,
  connectionName,
  access,
}: {
  host: string;
  orgSlug: string;
  workspaceName: string;
  connectionName: string;
  access?: string;
}) {
  return (
    <>
      <p className="zq-consent-sub">{agentName(host)} can only reach:</p>
      <dl className="zq-consent-scope">
        <dt>Org</dt>
        <dd>{orgSlug}</dd>
        <dt>Workspace</dt>
        <dd>{workspaceName}</dd>
        <dt>Connection</dt>
        <dd>{connectionName}</dd>
        {access && (
          <>
            <dt>Access</dt>
            <dd className="zq-consent-access">{access}</dd>
          </>
        )}
      </dl>
    </>
  );
}

export const metadata = { title: "Connect an agent", robots: { index: false, follow: false } };

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state") ?? "";
  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method");
  const scope = get("scope") ?? "mcp";

  if (!clientId || !redirectUri) {
    return errorPage("Missing parameters", "client_id and redirect_uri are both required.");
  }

  // A CIMD client_id makes this page fetch a URL an anonymous visitor
  // chose — rate limited per IP so that isn't a free way to make this
  // server issue arbitrary outbound requests on demand.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`authorize:${ip}`, 20, 60_000))) {
    return errorPage("Too many requests", "Try again in a minute.");
  }

  const client = await getClientByClientId(clientId);
  if (!client) {
    return errorPage(
      "Couldn't verify this client",
      "client_id must be an https:// URL to a Client ID Metadata Document Zeqqat could reach and validate. If this client just registered, try again in a moment.",
    );
  }

  // redirect_uri is checked before anything else can happen with it — an
  // unregistered redirect_uri never gets a redirect back to it, even to
  // report an error (that would be an open redirect).
  if (!validateRedirectUri(client, redirectUri)) {
    return errorPage("Redirect URI not recognized", "This redirect_uri wasn't registered for this client.");
  }

  // From here on, redirect_uri is trusted, so remaining validation errors
  // go back to the client as an error redirect rather than a dead end.
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "invalid_request");
    url.searchParams.set("error_description", "PKCE S256 code_challenge is required");
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  }

  const host = clientHost(client.clientName);
  // A failed sign-in comes back here with ?error=; keep it out of the URL we
  // hand to the next attempt so errors don't pile up.
  const { error: signInError, ...authParams } = params as Record<string, string>;
  const currentUrl = `/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
  const errorText = signInErrorText(typeof signInError === "string" ? signInError : undefined);
  const session = await getServerSession();

  const hidden = (
    <>
      <input type="hidden" name="oauth_client_id" value={client.id} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="code_challenge" value={codeChallenge} />
      <input type="hidden" name="scope" value={scope} />
    </>
  );

  const who = session?.user ? (
    <p className="zq-consent-who">
      Signed in as {session.user.email || session.user.name} · <SwitchAccount />
    </p>
  ) : null;

  // Signing in for a connection URL (RFC 8707 `resource`). The URL fixes
  // the org, workspace and connection, so there is nothing to choose here.
  const conn = await connectionFromResource(get("resource"));
  // During a sunset's warning period sign-in still works; after the
  // cutoff the connection serves no tools, so there's nothing to sign in to.
  const cutOff = conn ? sunsetState(conn) === "cutoff" : false;
  if (conn && (cutOff || conn.authMode !== "members")) {
    return errorPage("This connection doesn't take sign-ins", cutOff ? "It has been retired." : "It's public, so it needs no sign-in.");
  }
  if (conn) {
    const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, conn.workspaceId) });
    const scope = { host, orgSlug: conn.orgSlug, workspaceName: ws?.name ?? "Workspace", connectionName: conn.name };

    if (!session?.user) {
      return (
        <Shell host={host}>
          <Scope {...scope} />
          <SignInButtons providers={signInProviders} callbackURL={currentUrl} error={errorText} />
        </Shell>
      );
    }

    const role = await workspaceRoleFor(session.user.id, conn.workspaceId);
    if (!role) {
      return errorPage(
        "You're not in this workspace",
        `${conn.name} belongs to a workspace in @${conn.orgSlug} that ${session.user.email} hasn't been added to. Ask one of its admins to add you.`,
      );
    }

    // One line for the whole connection: the most it allows on any of its
    // instances, narrowed by this person's role.
    const policy = (await getConnectionPolicy(conn.id, conn.workspaceId)).filter((p) => p.enabled);
    const perm = union(policy.map((p) => intersect(p.perm, ROLE_CAP[role])));
    const access = policy.length === 0 ? "Nothing yet. An admin adds instances to this connection." : describe(perm);

    return (
      <Shell host={host}>
        <Scope {...scope} access={access} />
        <form action={authorizeAction}>
          {hidden}
          <input type="hidden" name="connection_id" value={conn.id} />
          <ConsentButtons denyAction={denyAction} />
        </form>
        {who}
      </Shell>
    );
  }

  // No connection named: the bare /mcp endpoint is retired, so every
  // sign-in is for one connection URL (naming doc v2, sections 6 and 9).
  return errorPage(
    "Sign in from a connection URL",
    `This sign-in doesn't say which Zeqqat connection it's for. Add the connection URL from your workspace (it looks like ${new URL(publicUrl()).host}/<org>/mcp/<name>/<id>) to your MCP client and sign in from there.`,
  );
}
