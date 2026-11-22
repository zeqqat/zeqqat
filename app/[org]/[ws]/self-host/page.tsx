import { and, eq } from "drizzle-orm";
import { SelfHostFlow } from "../../../../components/SelfHostFlow";
import { db } from "../../../../db";
import { instance, integration, user } from "../../../../db/schema";
import { siteHost } from "../../../../lib/edition";
import { here, requireOwner } from "../../../../lib/guard";
import { inWorkspace } from "../../../../lib/instance-scope";
import { listConnectedAgents } from "../../../../lib/permissions";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function SelfHostPage() {
  const base = await here();
  const { ws } = await requireOwner();
  const [rows, agents] = await Promise.all([
    db
      .select({
        id: instance.id,
        alias: instance.alias,
        baseUrl: instance.baseUrl,
        keyHint: instance.keyHint,
        createdAt: instance.createdAt,
        addedBy: user.name,
      })
      .from(instance)
      .innerJoin(integration, eq(integration.id, instance.integrationId))
      .leftJoin(user, eq(user.id, instance.createdByUserId))
      .where(and(inWorkspace(ws.workspaceId), eq(integration.slug, "dokploy"))),
    listConnectedAgents(ws.workspaceId),
  ]);
  const instances = rows.map((r) => ({
    id: r.id,
    alias: r.alias,
    host: r.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    keyHint: r.keyHint,
    added: `Added ${day(r.createdAt)}${r.addedBy ? ` by ${r.addedBy}` : ""}`,
  }));

  if (instances.length === 0) {
    return (
      <div className="zq-sh">
        <h1 className="zq-h">
          Install Zeqqat on your own Dokploy<span className="dot">.</span>
        </h1>
        <p className="zq-empty">
          Connect a Dokploy instance first.{" "}
          <a className="zq-textlink" href={`${base}`}>
            Connect Dokploy
          </a>
        </p>
      </div>
    );
  }
  return <SelfHostFlow instances={instances} agents={agents.map((a) => a.host)} siteHost={siteHost()} />;
}
