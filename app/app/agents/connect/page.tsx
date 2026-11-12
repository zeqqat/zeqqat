import { AgentPicker } from "../../../../components/AgentPicker";
import { primaryConnection } from "../../../../lib/connections";
import { requireWorkspace } from "../../../../lib/guard";

export default async function ConnectAgentPage() {
  const { user, ws } = await requireWorkspace();
  const conn = await primaryConnection(ws, user.id);
  return (
    <div>
      <p className="zq-kicker">
        <a href="/app/agents">Agents</a> / Connect
      </p>
      <h1 className="zq-h">
        Connect an agent<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Add this one URL to any MCP client. It asks you to sign in and approve it the first time, then shows up in
        Agents.
      </p>
      <div className="zq-block">
        <AgentPicker mcpUrl={conn.url} />
      </div>
    </div>
  );
}
