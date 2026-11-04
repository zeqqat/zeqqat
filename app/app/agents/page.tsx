import { AgentMark } from "../../../components/Marks";
import { requireWorkspace } from "../../../lib/guard";
import { listConnectedAgents } from "../../../lib/permissions";

function ago(d: Date | null) {
  if (!d) return null;
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function AgentsPage() {
  const { ws } = await requireWorkspace();
  const agents = await listConnectedAgents(ws.workspaceId);

  return (
    <div>
      <div className="zq-head-row">
        <div>
          <p className="zq-kicker">Agents</p>
          <h1 className="zq-h">
            Connected agents<span className="dot">.</span>
          </h1>
          <p className="zq-sub">
            Each agent is named by the address it registered from, not the name it gives itself. Disconnect one and it
            loses access on its next call.
          </p>
        </div>
        <a className="zq-action zq-action-primary" href="/app/agents/connect">
          Connect an agent
        </a>
      </div>

      <div className="zq-block">
        {agents.length === 0 ? (
          <p className="zq-empty">
            No agents yet. <a className="zq-textlink" href="/app/agents/connect">Connect one</a> with your MCP URL.
          </p>
        ) : (
          <div className="zq-list">
            {agents.map((a) => (
              <a className="zq-item" key={a.oauthClientId} href={`/app/agents/${a.oauthClientId}`}>
                <span className="zq-item-ic">
                  <AgentMark host={a.host} />
                </span>
                <div className="zq-item-main">
                  <div className="zq-item-t">{a.host}</div>
                  <div className="zq-item-s">
                    {a.connectedBy ? `Connected by ${a.connectedBy}` : "Connected"} · {a.connectedAt.toUTCString().slice(5, 16)}
                  </div>
                </div>
                <div className="zq-item-r">
                  {a.lastSeenAt ? <span className="zq-badge">Signed in {ago(a.lastSeenAt)}</span> : null}
                </div>
              </a>
            ))}
          </div>
        )}
        <p className="zq-note">
          Agents only reach Zeqqat through your MCP URL and their own sign-in. They can&rsquo;t see API keys, add
          instances or change permissions.
        </p>
      </div>
    </div>
  );
}
