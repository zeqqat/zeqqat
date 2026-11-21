import { and, eq } from "drizzle-orm";
import { SelfHostFlow } from "../../../../components/SelfHostFlow";
import { db } from "../../../../db";
import { instance, integration } from "../../../../db/schema";
import { siteHost } from "../../../../lib/edition";
import { here, requireOwner } from "../../../../lib/guard";
import { listConnectedAgents } from "../../../../lib/permissions";

import { inWorkspace } from "../../../../lib/instance-scope";
export default async function SelfHostPage() {
  const base = await here();
  const { ws } = await requireOwner();
  const [instances, agents] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias })
      .from(instance)
      .innerJoin(integration, eq(integration.id, instance.integrationId))
      .where(and(inWorkspace(ws.workspaceId), eq(integration.slug, "dokploy"))),
    listConnectedAgents(ws.workspaceId),
  ]);

  return (
    <div>
      <p className="zq-kicker">
        <a href={`${base}`}>Overview</a> / Self-host
      </p>
      <h1 className="zq-h">
        Install Zeqqat on your own Dokploy<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        One click, and Zeqqat installs itself on your Dokploy with the key it already has.
      </p>
      {instances.length === 0 ? (
        <div className="zq-block">
          <p className="zq-empty">
            Connect a Dokploy instance first. <a className="zq-textlink" href={`${base}`}>Connect Dokploy</a>
          </p>
        </div>
      ) : (
        <SelfHostFlow
          instances={instances}
          agents={agents.map((a) => a.host)}
          siteHost={siteHost()}
        />
      )}
    </div>
  );
}
