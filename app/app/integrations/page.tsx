import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { ConnectAppForm } from "../../../components/ConnectAppForm";
import { ConnectDokployForm } from "../../../components/ConnectDokployForm";
import { ImportAppForm } from "../../../components/ImportAppForm";
import { IntegrationMark } from "../../../components/Marks";
import { StatusBadge } from "../../../components/StatusBadge";
import { db } from "../../../db";
import { instance, integration, oauthGrant, organization } from "../../../db/schema";
import { requireWorkspace } from "../../../lib/guard";

// An integration is a kind of system (Dokploy). Each server someone adds
// with a key is an instance of it. This page lists the integrations
// Zeqqat offers, with this workspace's instances grouped under each one.
export default async function IntegrationsPage({
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

  const [offered, rows, liveAgents] = await Promise.all([
    db
      .select({
        id: integration.id,
        slug: integration.slug,
        name: integration.name,
        official: integration.official,
        logoUrl: integration.logoUrl,
        specUrl: integration.specUrl,
        docsUrl: integration.docsUrl,
        defaultBaseUrl: integration.defaultBaseUrl,
        orgSlug: organization.slug,
      })
      .from(integration)
      .innerJoin(organization, eq(organization.id, integration.organizationId))
      .where(or(eq(integration.official, true), eq(integration.organizationId, ws.organizationId)))
      .orderBy(asc(integration.name)),
    db
      .select({
        id: instance.id,
        alias: instance.alias,
        baseUrl: instance.baseUrl,
        lastStatus: instance.lastStatus,
        lastVersion: instance.lastVersion,
        integrationId: integration.id,
        integrationSlug: integration.slug,
        integrationName: integration.name,
        integrationLogo: integration.logoUrl,
        integrationOfficial: integration.official,
        integrationSpecUrl: integration.specUrl,
        integrationDocsUrl: integration.docsUrl,
        integrationBaseUrl: integration.defaultBaseUrl,
        integrationOrgSlug: organization.slug,
      })
      .from(instance)
      .innerJoin(integration, eq(integration.id, instance.integrationId))
      .innerJoin(organization, eq(organization.id, integration.organizationId))
      .where(eq(instance.workspaceId, ws.workspaceId))
      .orderBy(desc(instance.createdAt)),
    db
      .selectDistinct({ id: oauthGrant.oauthClientId })
      .from(oauthGrant)
      .where(and(eq(oauthGrant.workspaceId, ws.workspaceId), isNull(oauthGrant.revokedAt))),
  ]);

  // Every offered integration shows, plus any other integration this
  // workspace already has instances of.
  const groups = [...offered];
  for (const r of rows) {
    if (!groups.some((g) => g.id === r.integrationId)) {
      groups.push({
        id: r.integrationId,
        slug: r.integrationSlug,
        name: r.integrationName,
        official: r.integrationOfficial,
        logoUrl: r.integrationLogo,
        specUrl: r.integrationSpecUrl,
        docsUrl: r.integrationDocsUrl,
        defaultBaseUrl: r.integrationBaseUrl,
        orgSlug: r.integrationOrgSlug,
      });
    }
  }
  const dokployCount = rows.filter((r) => r.integrationSlug === "dokploy").length;
  const connecting = connectId ? groups.find((g) => g.id === connectId && !(g.official && g.slug === "dokploy")) : undefined;

  return (
    <div>
      <div className="zq-head-row">
        <div>
          <p className="zq-kicker">Integrations</p>
          <h1 className="zq-h">
            What this workspace connects to<span className="dot">.</span>
          </h1>
          <p className="zq-sub">
            Each server you add is an instance, with its own API key, encrypted and never shown after saving.
            Connections decide which agents reach which instance, and how far.
          </p>
        </div>
        {isOwner && !adding && !importing && !connecting && (
          <div className="zq-row-actions">
            <a className="zq-action" href="/app/integrations?add=1">
              {dokployCount ? "Connect another Dokploy" : "Connect a Dokploy"}
            </a>
            <a className="zq-action zq-action-primary" href="/app/integrations?add=app">
              Add an app
            </a>
          </div>
        )}
      </div>

      {params.connected && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            Connected <b>{String(params.connected)}</b>. Its key is saved and encrypted.
          </span>
        </div>
      )}
      {params.imported && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
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
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Instance removed. Its key is deleted from Zeqqat.</span>
        </div>
      )}

      {adding && isOwner && (
        <section className="zq-block">
          <h2 className="zq-block-t">{dokployCount ? "Connect another Dokploy" : "Connect a Dokploy"}</h2>
          <ConnectDokployForm next="integrations" defaultAlias={dokployCount ? `my-dokploy-${dokployCount + 1}` : "my-dokploy"} />
        </section>
      )}

      {importing && isOwner && (
        <section className="zq-block">
          <h2 className="zq-block-t">Add an app</h2>
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
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IntegrationMark slug={connecting.slug} name={connecting.name} logo={connecting.logoUrl} size={20} />
            Connect {connecting.name}
          </h2>
          <ConnectAppForm integrationId={connecting.id} appName={connecting.name} defaultBaseUrl={connecting.defaultBaseUrl} />
        </section>
      )}

      {groups.length === 0 && (
        <div className="zq-block">
          <p className="zq-empty">No integrations are set up on this Zeqqat yet.</p>
        </div>
      )}

      {groups.map((g) => {
        const mine = rows.filter((r) => r.integrationId === g.id);
        return (
          <section className="zq-block" key={g.id}>
            <h2 className="zq-block-t" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IntegrationMark slug={g.slug} name={g.name} logo={g.logoUrl} size={20} />
              {g.name}
              <span className="zq-item-s" style={{ fontWeight: 400 }}>
                @{g.orgSlug}/{g.slug} · {mine.length} {mine.length === 1 ? "instance" : "instances"}
              </span>
              {isOwner && !(g.official && g.slug === "dokploy") && (
                <a className="zq-textlink" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 500 }} href={`/app/integrations?connect=${g.id}`}>
                  Add instance
                </a>
              )}
            </h2>
            {(g.specUrl || g.docsUrl) && (
              <p className="zq-item-s" style={{ margin: "2px 0 10px" }}>
                {g.specUrl && (
                  <a className="zq-textlink" href={g.specUrl} rel="noreferrer" target="_blank">
                    Spec
                  </a>
                )}
                {g.specUrl && g.docsUrl && " · "}
                {g.docsUrl && (
                  <a className="zq-textlink" href={g.docsUrl} rel="noreferrer" target="_blank">
                    Docs
                  </a>
                )}
              </p>
            )}
            {mine.length === 0 ? (
              <p className="zq-empty">
                {isOwner
                  ? `No ${g.name} connected yet.`
                  : `No ${g.name} connected yet. An owner of this workspace adds it.`}
              </p>
            ) : (
              <div className="zq-list">
                {mine.map((r) => (
                  <a className="zq-item" key={r.id} href={`/app/instances/${r.id}`}>
                    <span className="zq-item-ic">
                      <IntegrationMark slug={g.slug} name={g.name} logo={g.logoUrl} size={18} />
                    </span>
                    <div className="zq-item-main">
                      <div className="zq-item-t">{r.alias}</div>
                      <div className="zq-item-s">
                        {[r.baseUrl, r.lastVersion ? `${g.name} ${r.lastVersion}` : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="zq-item-r">
                      <StatusBadge status={r.lastStatus} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <p className="zq-note">
        {liveAgents.length} {liveAgents.length === 1 ? "agent is" : "agents are"} signed in to this workspace. Set what
        each URL can do on each instance in <a className="zq-textlink" href="/app/connections">Connections</a>.
      </p>
    </div>
  );
}
