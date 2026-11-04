import { redirect } from "next/navigation";
import { CallLogList } from "../../../../components/CallLogList";
import { AgentMark, DokployMark } from "../../../../components/Marks";
import { PermMatrix, type MatrixRow } from "../../../../components/PermMatrix";
import { revokeAgentAction } from "../../../../lib/actions/agents";
import { getCallsForAgent, toCallView } from "../../../../lib/calls";
import { requireWorkspace } from "../../../../lib/guard";
import { getPermissionMatrix, listConnectedAgents } from "../../../../lib/permissions";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";

  const agents = await listConnectedAgents(ws.workspaceId);
  const agent = agents.find((a) => a.oauthClientId === id);
  if (!agent) redirect("/app/agents");

  const [calls, matrix] = await Promise.all([getCallsForAgent(ws.workspaceId, id, 50), getPermissionMatrix(ws.workspaceId)]);
  const views = calls.map(toCallView);
  const blocked = views.filter((c) => c.outcome === "blocked").length;
  const redacted = views.reduce((n, c) => n + c.redactions, 0);

  const rows: MatrixRow[] = matrix.instances.map((i) => {
    const c = matrix.cell(i.id, id);
    return { key: i.id, instanceId: i.id, oauthClientId: id, label: i.alias, icon: <DokployMark />, perm: c.perm, own: c.own };
  });

  return (
    <div>
      <p className="zq-kicker">
        <a href="/app/agents">Agents</a> / {agent.host}
      </p>
      <h1 className="zq-h" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AgentMark host={agent.host} size={24} />
        {agent.host}
      </h1>

      <dl className="zq-kv" style={{ marginTop: 16 }}>
        <dt>Identified by</dt>
        <dd>{agent.host}, the host of its client ID</dd>
        <dt>Client ID</dt>
        <dd>{agent.clientId}</dd>
        <dt>Connected by</dt>
        <dd>
          {agent.connectedBy ?? "Someone on your team"}, {agent.connectedAt.toUTCString().slice(5, 16)}
        </dd>
        <dt>Last 50 calls</dt>
        <dd>
          {views.length} calls · {blocked} blocked · {redacted} secrets redacted
        </dd>
      </dl>

      <section className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">What {agent.host} can do</h2>
          <span className="zq-block-a" style={{ color: "var(--faint)" }}>
            Changes apply to its next call
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="zq-empty">No Dokploy connected to this workspace yet.</p>
        ) : (
          <PermMatrix rows={rows} firstCol="Instance" editable={isOwner} />
        )}
      </section>

      <section className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">Calls</h2>
        </div>
        <CallLogList calls={views} showInstance filters />
      </section>

      <section className="zq-block">
        <div className="zq-confirm">
          <h2 className="zq-block-t">Disconnect {agent.host}</h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            {isOwner
              ? "Revokes its sign-in for everyone in this workspace. Its next call fails until someone connects it again. Activity history stays."
              : "Revokes your connection of this agent. Its next call from you fails until you connect it again."}
          </p>
          <form action={revokeAgentAction} className="zq-row-actions" style={{ marginTop: 14 }}>
            <input type="hidden" name="oauth_client_id" value={id} />
            <button type="submit" className="zq-action zq-action-danger">
              Disconnect
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
