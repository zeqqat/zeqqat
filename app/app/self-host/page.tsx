import { and, eq } from "drizzle-orm";
import { SelfHostFlow } from "../../../components/SelfHostFlow";
import { db } from "../../../db";
import { instance, integration } from "../../../db/schema";
import { siteHost } from "../../../lib/edition";
import { requireOwner } from "../../../lib/guard";
import { listConnectedAgents } from "../../../lib/permissions";

export default async function SelfHostPage() {
  const { ws } = await requireOwner();
  const [instances, agents] = await Promise.all([
    db
      .select({ id: instance.id, alias: instance.alias })
      .from(instance)
      .innerJoin(integration, eq(integration.id, instance.integrationId))
      .where(and(eq(instance.workspaceId, ws.workspaceId), eq(integration.slug, "dokploy"))),
    listConnectedAgents(ws.workspaceId),
  ]);

  return (
    <div>
      <p className="zq-kicker">
        <a href="/app">Overview</a> / Self-host
      </p>
      <h1 className="zq-h">
        Install Zeqqat on your own Dokploy<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        One click, and Zeqqat installs itself on your Dokploy with the key it already has. Prefer to do it by hand?
        Follow{" "}
        <a className="zq-textlink" href="/docs/self-host">
          the self-hosting guide
        </a>
        .
      </p>
      {instances.length === 0 ? (
        <div className="zq-block">
          <p className="zq-empty">
            Connect a Dokploy instance first. <a className="zq-textlink" href="/app">Connect Dokploy</a>
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
