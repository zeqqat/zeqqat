import { and, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "../../../../../components/CopyButton";
import { PublicHeader } from "../../../../../components/PublicHeader";
import { db } from "../../../../../db";
import { oauthClient, oauthGrant, user, workspace } from "../../../../../db/schema";
import { switchWorkspaceAction } from "../../../../../lib/actions/workspace";
import {
  findConnectionByPath,
  formatCutoff,
  getConnectionPolicy,
  intersect,
  ROLE_CAP,
  sunsetNotice,
  type Kind,
  type Perm,
} from "../../../../../lib/connections";
import { agentHost } from "../../../../../lib/permissions";
import { getServerSession } from "../../../../../lib/session";
import { getUserWorkspace, workspaceRoleFor } from "../../../../../lib/workspace";

type Props = { params: Promise<{ org: string; name: string; id: string }> };

export const metadata: Metadata = { title: "Connection", robots: { index: false } };

const KINDS: { k: Kind; label: string }[] = [
  { k: "read", label: "Read" },
  { k: "create", label: "Create" },
  { k: "edit", label: "Edit" },
  { k: "delete", label: "Delete" },
];

function can(p: Perm) {
  const list = KINDS.filter((k) => p[k.k]).map((k) => k.label.toLowerCase());
  return list.length ? list.join(", ") : "nothing";
}

// The page side of a connection URL (naming doc v2, section 8). The same
// URL is the MCP endpoint: the proxy sends POSTs there and only GETs that
// ask for HTML here.
//   Not signed in:              404.
//   Signed in, no access:       404 (same as a URL that doesn't exist).
//   Signed in with access:      what the connection gives you.
//   Admin of its workspace:     what it gives, to whom, and in which workspace.
export default async function ConnectionUrlPage({ params }: Props) {
  const { org, name, id } = await params;
  const session = await getServerSession();
  if (!session?.user) notFound();
  const conn = await findConnectionByPath(org, name, id);
  if (!conn) notFound();
  const role = await workspaceRoleFor(session.user.id, conn.workspaceId);
  if (!role) notFound();
  const isAdmin = role === "admin";

  const [ws, policy, notice, current] = await Promise.all([
    db.query.workspace.findFirst({ where: eq(workspace.id, conn.workspaceId) }),
    getConnectionPolicy(conn.id, conn.workspaceId),
    sunsetNotice(conn),
    getUserWorkspace(session.user.id),
  ]);
  const reachable = policy.filter((p) => p.enabled);
  const isPublic = conn.authMode === "public";
  const yourCap = isPublic ? ROLE_CAP.public : ROLE_CAP[role];

  const people = isAdmin
    ? await db
        .select({ grantId: oauthGrant.id, clientId: oauthClient.clientId, clientName: oauthClient.clientName, email: user.email, at: oauthGrant.createdAt })
        .from(oauthGrant)
        .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.oauthClientId))
        .leftJoin(user, eq(user.id, oauthGrant.userId))
        .where(and(eq(oauthGrant.connectionId, conn.id), isNull(oauthGrant.revokedAt)))
        .orderBy(desc(oauthGrant.createdAt))
    : [];
  const inCurrentWorkspace = current?.workspaceId === conn.workspaceId;

  return (
    <div className="zq">
      <PublicHeader right={<a className="zq-link" href="/app">Dashboard</a>} />
      <main className="zq-body" style={{ maxWidth: 860 }}>
        <p className="zq-kicker">
          <a href={`/${conn.orgSlug}`}>@{conn.orgSlug}</a> / Connection
        </p>
        <h1 className="zq-h">
          {conn.name}
          <span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          {conn.description ? `${conn.description}. ` : ""}
          {isPublic ? "Anyone with this URL can use it without signing in. Read only." : "Agents sign in as a workspace member."}
          {isAdmin && ws ? ` In the ${ws.name} workspace.` : ""}
        </p>

        {notice.state !== "live" && (
          <div className="zq-warn-box" role="status" style={{ marginTop: 20 }}>
            <span className="ic" aria-hidden="true">
              !
            </span>
            <span>
              {notice.state === "warning" ? `Being retired on ${formatCutoff(conn.sunsetAt!)}.` : `Retired on ${formatCutoff(conn.sunsetAt!)}. It serves no tools.`}{" "}
              {notice.replacementUrl ? (
                <>
                  Use <a className="zq-textlink" href={notice.replacementUrl}>{notice.replacementUrl}</a> instead.
                </>
              ) : null}
            </span>
          </div>
        )}

        <div className="zq-urlbox">
          <code>{conn.url}</code>
          <CopyButton text={conn.url} />
        </div>
        <p className="zq-note">Add this URL to your MCP client. It signs you in the first time it connects.</p>

        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            {isAdmin ? "What it gives" : "What it gives you"}
          </h2>
          {reachable.length === 0 ? (
            <p className="zq-empty">No instances yet. A workspace admin adds them to this connection.</p>
          ) : (
            <div className="zq-matrix-wrap">
              <table className="zq-matrix zq-policy">
                <thead>
                  <tr>
                    <th>Instance</th>
                    {isAdmin && <th>Connection allows</th>}
                    <th>{isAdmin ? "Your role" : `You (${isPublic ? "public" : role})`}</th>
                  </tr>
                </thead>
                <tbody>
                  {reachable.map((p) => (
                    <tr key={p.instanceId}>
                      <td>
                        <span className="zq-item-s">{p.integrationName} · </span>
                        <b>{p.alias}</b>
                      </td>
                      {isAdmin && <td>{can(p.perm)}</td>}
                      <td>{can(intersect(p.perm, yourCap))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="zq-block">
            <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
              To whom
            </h2>
            {isPublic ? (
              <p className="zq-empty">Anyone with the URL, without signing in. Every call is read only.</p>
            ) : (
              <>
                <p className="zq-note" style={{ marginTop: 0 }}>
                  Every member of {ws?.name ?? "the workspace"} who signs in, narrowed by their role: viewers read, members read,
                  create and edit, admins can do everything the connection allows.
                </p>
                {people.length === 0 ? (
                  <p className="zq-empty">Nobody has signed in yet.</p>
                ) : (
                  <div className="zq-list">
                    {people.map((s) => (
                      <div className="zq-item" key={s.grantId}>
                        <div className="zq-item-main">
                          <div className="zq-item-t">{s.email ?? "unknown"}</div>
                          <div className="zq-item-s">
                            {agentHost(s.clientId, s.clientName)} · since {s.at.toUTCString().slice(5, 16)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="zq-block">
            {inCurrentWorkspace ? (
              <a className="zq-action zq-action-primary" href={`/app/connections/${conn.id}`}>
                Manage in the dashboard
              </a>
            ) : (
              <form action={switchWorkspaceAction}>
                <input type="hidden" name="workspace_id" value={conn.workspaceId} />
                <button type="submit" className="zq-action zq-action-primary">
                  Switch to {ws?.name ?? "its workspace"} to manage it
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
