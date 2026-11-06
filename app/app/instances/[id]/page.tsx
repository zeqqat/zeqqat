import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CallLogList } from "../../../../components/CallLogList";
import { AgentMark, IntegrationMark } from "../../../../components/Marks";
import { PermMatrix, type MatrixRow } from "../../../../components/PermMatrix";
import { ReplaceKeyForm } from "../../../../components/ReplaceKeyForm";
import { StatusBadge } from "../../../../components/StatusBadge";
import { db } from "../../../../db";
import { instance, integration, user } from "../../../../db/schema";
import { removeInstanceAction, retestInstanceAction } from "../../../../lib/actions/instances";
import { getCallsForInstance, toCallView } from "../../../../lib/calls";
import { requireWorkspace } from "../../../../lib/guard";
import { getPermissionMatrix, listConnectedAgents } from "../../../../lib/permissions";

export default async function InstanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";

  const [inst] = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      lastStatus: instance.lastStatus,
      lastVersion: instance.lastVersion,
      lastValidatedAt: instance.lastValidatedAt,
      createdAt: instance.createdAt,
      createdBy: user.email,
      appSlug: integration.slug,
      appName: integration.name,
      appLogo: integration.logoUrl,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .leftJoin(user, eq(user.id, instance.createdByUserId))
    .where(and(eq(instance.id, id), eq(instance.workspaceId, ws.workspaceId)))
    .limit(1);
  if (!inst) redirect("/app/integrations");

  const [calls, agents, matrix] = await Promise.all([
    getCallsForInstance(ws.workspaceId, id, 50),
    listConnectedAgents(ws.workspaceId),
    getPermissionMatrix(ws.workspaceId),
  ]);

  const rows: MatrixRow[] = [
    { key: "default", instanceId: id, oauthClientId: null, label: "Workspace default", hint: "New agents start here", perm: matrix.cell(id, null).perm, own: true },
    ...agents.map((a) => {
      const c = matrix.cell(id, a.oauthClientId);
      return {
        key: a.oauthClientId,
        instanceId: id,
        oauthClientId: a.oauthClientId,
        label: a.host,
        hint: a.connectedBy ?? undefined,
        icon: <AgentMark host={a.host} />,
        perm: c.perm,
        own: c.own,
      };
    }),
  ];

  return (
    <div>
      <p className="zq-kicker">
        <a href="/app/integrations">Integrations</a> / {inst.appName} / {inst.alias}
      </p>
      <div className="zq-head-row">
        <h1 className="zq-h" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IntegrationMark slug={inst.appSlug} name={inst.appName} logo={inst.appLogo} size={24} />
          {inst.alias}
        </h1>
        <StatusBadge status={inst.lastStatus} />
      </div>

      {query.key === "replaced" && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 12 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>New key tested and saved. The old one is gone from Zeqqat.</span>
        </div>
      )}

      <dl className="zq-kv" style={{ marginTop: 16 }}>
        <dt>{inst.appName} URL</dt>
        <dd>{inst.baseUrl}</dd>
        <dt>Version</dt>
        <dd>{inst.lastVersion ? `${inst.appName} ${inst.lastVersion}` : "Not known yet"}</dd>
        <dt>API key</dt>
        <dd style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <span>Saved and encrypted. It can&rsquo;t be shown again.</span>
          {isOwner && <ReplaceKeyForm instanceId={inst.id} />}
        </dd>
        <dt>Last checked</dt>
        <dd style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <span>{inst.lastValidatedAt ? inst.lastValidatedAt.toUTCString() : "Never"}</span>
          {isOwner && (
            <form action={retestInstanceAction}>
              <input type="hidden" name="instance_id" value={inst.id} />
              <button type="submit" className="zq-action zq-action-sm">
                Check now
              </button>
            </form>
          )}
        </dd>
        <dt>Connected by</dt>
        <dd>
          {inst.createdBy ?? "Someone on your team"}, {inst.createdAt.toUTCString().slice(5, 16)}
        </dd>
        <dt>Redaction</dt>
        <dd>
          <span className="zq-redact">[redacted by zeqqat]</span> replaces env vars, database URLs and tokens in every
          response
        </dd>
      </dl>

      <section className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">What agents can do on {inst.alias}</h2>
          <a href="/app/permissions" className="zq-block-a">
            All permissions
          </a>
        </div>
        <PermMatrix rows={rows} firstCol="Agent" editable={isOwner} />
      </section>

      <section className="zq-block">
        <div className="zq-block-h">
          <h2 className="zq-block-t">Calls on {inst.alias}</h2>
        </div>
        <CallLogList calls={calls.map(toCallView)} showAgent filters />
      </section>

      {isOwner && (
        <section className="zq-block">
          <div className="zq-confirm">
            <h2 className="zq-block-t">Remove this instance</h2>
            <p className="zq-note" style={{ marginTop: 8 }}>
              Deletes the API key from Zeqqat and removes every agent&rsquo;s access to {inst.alias}. Past activity stays
              in the log. To be thorough, also revoke the key in {inst.appName}.
            </p>
            <form action={removeInstanceAction} className="zq-row-actions" style={{ marginTop: 14 }}>
              <input type="hidden" name="instance_id" value={inst.id} />
              <button type="submit" className="zq-action zq-action-danger">
                Remove {inst.alias}
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
