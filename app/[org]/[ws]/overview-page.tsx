import { eq } from "drizzle-orm";
import { RequestCard } from "../../../components/activity/RequestCard";
import { OverviewTiles } from "../../../components/OverviewTiles";
import { MemberStart, OnboardConnectAgent, OnboardConnectDokploy, SetupChoice } from "../../../components/Onboarding";
import { db } from "../../../db";
import { instance } from "../../../db/schema";
import { listRequests } from "../../../lib/activity";
import { edition, siteHost } from "../../../lib/edition";
import { getConnection, primaryConnection } from "../../../lib/connections";
import { connectionMember, connection } from "../../../db/schema";
import { and, asc, isNull } from "drizzle-orm";
import { here, requireWorkspace } from "../../../lib/guard";
import { getOverviewStats, listWorkspacePeople } from "../../../lib/overview";
import { listConnectedAgents } from "../../../lib/permissions";
import { hasOwnAgent } from "../../../lib/workspace";

import { inWorkspace } from "../../../lib/instance-scope";

// The overview (/<username>/<workspace>) walks a new user through setup, one screen per missing piece, then
// becomes the overview: owner without Dokploy → connect Dokploy; anyone
// without an agent → connect an agent (members skip the Dokploy step, the
// team already did it); an owner who hasn't answered where to run Zeqqat →
// that choice; otherwise the overview.
export default async function OverviewPage() {
  const base = await here();
  const { user, ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";

  const [instances, agents] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias, lastStatus: instance.lastStatus, lastVersion: instance.lastVersion })
      .from(instance)
      .where(inWorkspace(ws.workspaceId))
      .orderBy(instance.createdAt),
    listConnectedAgents(ws.workspaceId),
  ]);

  // A new organization's owner connects its first Dokploy here; it belongs
  // to the account and this workspace uses it.
  if (ws.orgRole === "owner" && instances.length === 0) {
    const [any] = await db.select({ id: instance.id }).from(instance).where(eq(instance.organizationId, ws.organizationId)).limit(1);
    if (!any) return <OnboardConnectDokploy />;
  }

  // Owners finish setup once the workspace has any agent; a member's own
  // first run is about connecting their own agent.
  const needsAgent = isOwner ? agents.length === 0 : !(await hasOwnAgent(ws.workspaceId, user.id));
  if (needsAgent) {
    if (isOwner) {
      // The URL to hand out is the workspace's primary connection.
      const conn = await primaryConnection(ws, user.id);
      return <OnboardConnectAgent mcpUrl={conn.url} alias={instances[0]?.alias ?? null} base={base} />;
    }
    // A member gets the MCP URL their invite named (connection_member).
    const [given] = await db
      .select({ id: connection.id })
      .from(connectionMember)
      .innerJoin(connection, eq(connection.id, connectionMember.connectionId))
      .where(and(eq(connectionMember.userId, user.id), eq(connection.workspaceId, ws.workspaceId), isNull(connection.deletedAt)))
      .orderBy(asc(connection.createdAt))
      .limit(1);
    const conn = (given && (await getConnection(ws.workspaceId, given.id))) || (await primaryConnection(ws, user.id));
    return <MemberStart mcpUrl={conn.url} organization={ws.organizationName} base={base} />;
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
        base={base}
      />

      <div className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">Recent activity</h2>
          <a href={`${base}/activity`} className="zq-block-a">
            See all
          </a>
        </div>
        {recent.length === 0 ? (
          <p className="zq-empty">No calls yet.</p>
        ) : (
          <div className="zq-act-list">
            {recent.map((c) => (
              <RequestCard key={c.id} card={c} linked base={base} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
