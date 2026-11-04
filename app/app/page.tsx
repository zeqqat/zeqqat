import { eq } from "drizzle-orm";
import { RequestCard } from "../../components/activity/RequestCard";
import { OverviewTiles } from "../../components/OverviewTiles";
import { MemberStart, OnboardConnectAgent, OnboardConnectDokploy, SetupChoice } from "../../components/Onboarding";
import { db } from "../../db";
import { instance } from "../../db/schema";
import { listRequests } from "../../lib/activity";
import { edition, siteHost } from "../../lib/edition";
import { getConnectionPolicy, intersect, primaryConnection, ROLE_CAP } from "../../lib/connections";
import { requireWorkspace } from "../../lib/guard";
import { getOverviewStats, listWorkspacePeople } from "../../lib/overview";
import { listConnectedAgents, type Perm } from "../../lib/permissions";
import { hasOwnAgent, workspaceLabel } from "../../lib/workspace";

function summary(p: Perm) {
  const on = (["read", "create", "edit"] as const).filter((k) => p[k]);
  const left = on.length ? on.join(", ") : "nothing";
  return `${left.charAt(0).toUpperCase()}${left.slice(1)}${p.delete ? ", delete" : " · delete off"}`;
}

// /app walks a new user through setup, one screen per missing piece, then
// becomes the overview: owner without Dokploy → connect Dokploy; anyone
// without an agent → connect an agent (members skip the Dokploy step, the
// team already did it); an owner who hasn't answered where to run Zeqqat →
// that choice; otherwise the overview.
export default async function OverviewPage() {
  const { user, ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";

  const [instances, agents] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias, lastStatus: instance.lastStatus, lastVersion: instance.lastVersion })
      .from(instance)
      .where(eq(instance.workspaceId, ws.workspaceId))
      .orderBy(instance.createdAt),
    listConnectedAgents(ws.workspaceId),
  ]);

  if (isOwner && instances.length === 0) return <OnboardConnectDokploy />;

  // Owners finish setup once the workspace has any agent; a member's own
  // first run is about connecting their own agent.
  const needsAgent = isOwner ? agents.length === 0 : !(await hasOwnAgent(ws.workspaceId, user.id));
  if (needsAgent) {
    // The URL to hand out is the workspace's primary connection.
    const conn = await primaryConnection(ws, user.id);
    if (isOwner) return <OnboardConnectAgent mcpUrl={conn.url} alias={instances[0]?.alias ?? null} />;
    const policy = (await getConnectionPolicy(conn.id, ws.workspaceId)).filter((p) => p.enabled);
    return (
      <MemberStart
        mcpUrl={conn.url}
        name={(user.name || user.email).split(" ")[0]}
        workspace={workspaceLabel(ws)}
        instances={policy.map((p) => ({ alias: p.alias, summary: summary(intersect(p.perm, ROLE_CAP[ws.wsRole])) }))}
      />
    );
  }

  if (isOwner && !ws.setupCompletedAt && edition() === "cloud") {
    return <SetupChoice siteHost={siteHost()} agentHost={agents[0]?.host ?? null} />;
  }

  const [stats, recent, people] = await Promise.all([
    getOverviewStats(ws.workspaceId),
    listRequests({ userId: user.id, ws }, { limit: 5 }),
    listWorkspacePeople(ws.organizationId, ws.workspaceId),
  ]);
  const agentHosts = [...new Set(agents.map((a) => a.host))];

  return (
    <div>
      <OverviewTiles
        callsToday={stats.callsToday}
        hourly={stats.hourly}
        blockedToday={stats.blockedToday}
        redactedToday={stats.redactedToday}
        agentHosts={agentHosts}
        instances={instances}
        people={people}
      />

      <div className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">Recent activity</h2>
          <a href="/app/activity" className="zq-block-a">
            See all
          </a>
        </div>
        {recent.length === 0 ? (
          <p className="zq-empty">No requests yet.</p>
        ) : (
          <div className="zq-act-list">
            {recent.map((c) => (
              <RequestCard key={c.id} card={c} linked />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
