import { and, desc, eq, or } from "drizzle-orm";
import { ConnectAppForm } from "../../../components/ConnectAppForm";
import { ConnectDokployForm } from "../../../components/ConnectDokployForm";
import { ImportAppForm } from "../../../components/ImportAppForm";
import { InstanceCards, type InstanceCard } from "../../../components/InstanceCards";
import { IntegrationMark } from "../../../components/Marks";
import { db } from "../../../db";
import { instance, integration } from "../../../db/schema";
import { requireWorkspace } from "../../../lib/guard";
import { freshDokploy, instanceCounts, usageByInstance } from "../../../lib/instance-cards";

// Every server someone added with a key is an instance of an app (Dokploy).
// This page lists this workspace's instances as cards (components/
// InstanceCards.tsx) under a head with the count and "Add an instance". No
// heading, kicker or explanation: the menu says where you are (UI
// principles 6 and 9). Designed 2026-11-17, variant 32 of the card designs.
export default async function DokployInstancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const params = await searchParams;
  const isOwner = ws.role === "owner";
  const adding = params.add === "1";
  const importing = params.add === "app";
  const connectId = typeof params.connect === "string" ? params.connect : null;

  const [rows, connecting] = await Promise.all([
    db
      .select({
        id: instance.id,
        alias: instance.alias,
        baseUrl: instance.baseUrl,
        credential: instance.credential,
        lastStatus: instance.lastStatus,
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
      .where(eq(instance.workspaceId, ws.workspaceId))
      .orderBy(desc(instance.createdAt)),
    connectId
      ? db
          .select({
            id: integration.id,
            slug: integration.slug,
            name: integration.name,
            logoUrl: integration.logoUrl,
            official: integration.official,
            defaultBaseUrl: integration.defaultBaseUrl,
          })
          .from(integration)
          .where(
            and(
              eq(integration.id, connectId),
              or(eq(integration.official, true), eq(integration.organizationId, ws.organizationId)),
            ),
          )
          .then((r) => r.find((g) => !(g.official && g.slug === "dokploy")))
      : Promise.resolve(undefined),
  ]);

  const ids = rows.map((r) => r.id);
  const [usage, counts, fresh] = await Promise.all([
    usageByInstance(ws.workspaceId, ids),
    instanceCounts(ids),
    freshDokploy(rows.filter((r) => r.appSlug === "dokploy")),
  ]);

  const cards: InstanceCard[] = rows.map((r) => {
    const f = fresh.get(r.id);
    let host = r.baseUrl;
    try {
      host = new URL(r.baseUrl).host;
    } catch {
      // keep the stored address as typed
    }
    return {
      id: r.id,
      name: r.alias,
      host,
      appName: r.appName,
      appSlug: r.appSlug,
      appLogo: r.appLogo,
      status: f?.status ?? r.lastStatus,
      version: f?.version ?? r.lastVersion,
      latest: f?.latest ?? null,
      urls: counts.urls.get(r.id) ?? 0,
      people: counts.people.get(r.id) ?? 0,
      usage: usage.get(r.id) ?? { days: Array(30).fill(0), hours: Array(24).fill(0) },
    };
  });
  const dokployCount = rows.filter((r) => r.appSlug === "dokploy").length;
  const formOpen = (adding || importing || !!connecting) && isOwner;

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
      {params.imported && (
        <div className="zq-ok-box" role="status" style={{ marginBottom: 16 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            {params.updated ? "Updated" : "Added"} <b>@{ws.organizationSlug}/{String(params.imported)}</b> with{" "}
            {String(params.tools ?? 0)} tools. Each tool&apos;s kind (read, create, edit, delete) is guessed from its method
            and name; anything that looks destructive counts as delete. Add an instance below to use it.
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

      {adding && isOwner && (
        <section className="zq-panel-box" style={{ marginBottom: 16 }}>
          <h2 className="zq-block-t" style={{ marginBottom: 14 }}>
            {dokployCount ? "Add another Dokploy" : "Add a Dokploy"}
          </h2>
          <ConnectDokployForm next="dokploy-instances" defaultAlias={dokployCount ? `my-dokploy-${dokployCount + 1}` : "my-dokploy"} />
        </section>
      )}

      {importing && isOwner && (
        <section className="zq-panel-box" style={{ marginBottom: 16 }}>
          <h2 className="zq-block-t" style={{ marginBottom: 14 }}>
            Add an app
          </h2>
          <ImportAppForm
            account={ws.organizationSlug}
            prefill={{
              specUrl: typeof params.spec === "string" ? params.spec : undefined,
              docsUrl: typeof params.docs === "string" ? params.docs : undefined,
              name: typeof params.name === "string" ? params.name : undefined,
            }}
          />
        </section>
      )}

      {connecting && isOwner && (
        <section className="zq-panel-box" style={{ marginBottom: 16 }}>
          <h2 className="zq-block-t" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <IntegrationMark slug={connecting.slug} name={connecting.name} logo={connecting.logoUrl} size={20} />
            Connect {connecting.name}
          </h2>
          <ConnectAppForm integrationId={connecting.id} appName={connecting.name} defaultBaseUrl={connecting.defaultBaseUrl} />
        </section>
      )}

      <InstanceCards
        cards={cards}
        addHref={isOwner && !formOpen ? "/app/dokploy-instances?add=1" : null}
        emptyText={isOwner ? "No Dokploy connected yet." : "No Dokploy connected yet. An owner of this workspace adds it."}
      />
    </div>
  );
}
