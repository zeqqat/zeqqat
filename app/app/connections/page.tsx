import { and, eq, isNull, sql } from "drizzle-orm";
import { CopyButton } from "../../../components/CopyButton";
import { CreateConnectionForm } from "../../../components/ConnectionForms";
import { db } from "../../../db";
import { connectionGrant, oauthGrant } from "../../../db/schema";
import { formatCutoff, listConnections, sunsetState } from "../../../lib/connections";
import { publicUrl } from "../../../lib/env";
import { requireWorkspace } from "../../../lib/guard";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const isAdmin = ws.wsRole === "admin";
  const params = await searchParams;
  const adding = params.add === "1";

  const [conns, granted, agents] = await Promise.all([
    listConnections(ws.workspaceId),
    db
      .select({ id: connectionGrant.connectionId, n: sql<number>`count(*)::int` })
      .from(connectionGrant)
      .groupBy(connectionGrant.connectionId),
    db
      .select({ id: oauthGrant.connectionId, n: sql<number>`count(distinct ${oauthGrant.userId})::int` })
      .from(oauthGrant)
      .where(and(eq(oauthGrant.workspaceId, ws.workspaceId), isNull(oauthGrant.revokedAt)))
      .groupBy(oauthGrant.connectionId),
  ]);
  const count = (rows: { id: string | null; n: number }[], id: string) => rows.find((r) => r.id === id)?.n ?? 0;

  return (
    <div>
      <div className="zq-head-row">
        <div>
          <p className="zq-kicker">Connections</p>
          <h1 className="zq-h">
            The URLs you give agents<span className="dot">.</span>
          </h1>
          <p className="zq-sub">
            Each connection is one MCP URL, {new URL(publicUrl()).host}/{ws.organizationSlug}/mcp/&lt;name&gt;/&lt;id&gt;, with its own policy:
            which instances it reaches and what it may do there. Members sign in, and their role narrows it further, so one URL
            serves the whole team.
          </p>
        </div>
        {isAdmin && !adding && (
          <a className="zq-action zq-action-primary" href="/app/connections?add=1">
            New connection
          </a>
        )}
      </div>

      {params.deleted && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Connection deleted. Its URL no longer answers, and its short id is never used again.</span>
        </div>
      )}

      {adding && isAdmin && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t" style={{ marginBottom: 14 }}>
            New connection
          </h2>
          <CreateConnectionForm orgSlug={ws.organizationSlug} />
        </section>
      )}

      <div className="zq-block">
        {conns.length === 0 ? (
          <p className="zq-empty">
            {isAdmin
              ? "No connections yet. One is created for you when you add your first instance, or make one now."
              : "No connections yet. A workspace admin creates them."}
          </p>
        ) : (
          <div className="zq-list">
            {conns.map((c) => (
              <div className="zq-item" key={c.id}>
                <span className="zq-item-ic" aria-hidden="true">
                  {c.authMode === "public" ? "◎" : "⌁"}
                </span>
                <a className="zq-item-main" href={`/app/connections/${c.id}`}>
                  <div className="zq-item-t">
                    {c.name}{" "}
                    {c.authMode === "public" && <span className="zq-badge zq-badge-warn">Public</span>}
                    <span className="zq-item-s">{c.shortId}</span>{" "}
                    {sunsetState(c) === "warning" && <span className="zq-badge zq-badge-warn">Sunsets {formatCutoff(c.sunsetAt!)}</span>}
                    {sunsetState(c) === "cutoff" && <span className="zq-badge">Retired</span>}
                  </div>
                  <div className="zq-item-s">
                    {count(granted, c.id)} {count(granted, c.id) === 1 ? "instance" : "instances"}
                    {c.authMode === "members" ? ` · ${count(agents, c.id)} signed in` : " · no sign-in"}
                    {c.description ? ` · ${c.description}` : ""}
                  </div>
                </a>
                <div className="zq-item-r">
                  {sunsetState(c) !== "cutoff" && <CopyButton text={c.url} label="Copy URL" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          How access is decided
        </h2>
        <dl className="zq-kv">
          <dt>Connection</dt>
          <dd>The most anyone can do through this URL, per instance</dd>
          <dt>Role</dt>
          <dd>Viewers read only, members read, create and edit, admins can also delete</dd>
          <dt>Public</dt>
          <dd>No sign-in, always read only, runs on this workspace&rsquo;s keys</dd>
        </dl>
      </section>
    </div>
  );
}
