import { desc, eq, inArray } from "drizzle-orm";
import { ConnectDokployForm } from "../../../../components/ConnectDokployForm";
import { InstanceCards } from "../../../../components/InstanceCards";
import { db } from "../../../../db";
import { instance, integration, workspace, workspaceInstance } from "../../../../db/schema";
import { hereAccount, requireAccount } from "../../../../lib/guard";
import { cardsFor } from "../../../../lib/instance-cards";

// The account owns its Dokploy instances (connected once, used by any of
// its workspaces). Each card counts the workspaces that may use it; the
// instance's page decides which.
export default async function AccountInstancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acct = await hereAccount();
  const { acct: ws } = await requireAccount();
  const params = await searchParams;
  const isOwner = ws.orgRole === "owner";
  const rows = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      credential: instance.credential,
      lastStatus: instance.lastStatus,
      keyDeactivatedAt: instance.keyDeactivatedAt,
      lastVersion: instance.lastVersion,
      lastValidatedAt: instance.lastValidatedAt,
      specVersion: instance.specVersion,
      specCheckedAt: instance.specCheckedAt,
      appSlug: integration.slug,
      appName: integration.name,
      appLogo: integration.logoUrl,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(eq(instance.organizationId, ws.organizationId))
    .orderBy(desc(instance.createdAt));
  const ids = rows.map((r) => r.id);
  const given = ids.length
    ? await db
        .select({ instanceId: workspaceInstance.instanceId, name: workspace.name })
        .from(workspaceInstance)
        .innerJoin(workspace, eq(workspace.id, workspaceInstance.workspaceId))
        .where(inArray(workspaceInstance.instanceId, ids))
    : [];
  const workspacesOf = new Map<string, string[]>();
  for (const g of given) workspacesOf.set(g.instanceId, [...(workspacesOf.get(g.instanceId) ?? []), g.name]);
  const cards = await cardsFor(rows, null, workspacesOf);
  const adding = params.add === "1" && isOwner;
  const dokployCount = rows.filter((r) => r.appSlug === "dokploy").length;

  return (
    <div>
      {params.connected && (
        <div className="zq-ok-box" role="status" style={{ marginBottom: 16 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            Connected <b>{String(params.connected)}</b>. Its key is saved and encrypted.
          </span>
        </div>
      )}
      {params.removed && (
        <div className="zq-ok-box" role="status" style={{ marginBottom: 16 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Instance removed. Its key is deleted from Zeqqat.</span>
        </div>
      )}
      {adding && (
        <section className="zq-panel-box" style={{ marginBottom: 16 }}>
          <h2 className="zq-block-t" style={{ marginBottom: 14 }}>
            {dokployCount ? "Add another Dokploy" : "Add a Dokploy"}
          </h2>
          <ConnectDokployForm next="account" defaultAlias={dokployCount ? `my-dokploy-${dokployCount + 1}` : "my-dokploy"} />
        </section>
      )}
      <InstanceCards
        cards={cards}
        addHref={isOwner && !adding ? `${acct}/dokploy-instances?add=1` : null}
        emptyText="No Dokploy connected yet."
        what={params.what === "1"}
        linkBase={acct}
      />
    </div>
  );
}
