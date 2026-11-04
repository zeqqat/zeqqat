import { isNull, sql } from "drizzle-orm";
import { AgentMark } from "../../../components/Marks";
import { PermMatrix, type MatrixRow } from "../../../components/PermMatrix";
import { db } from "../../../db";
import { apiEndpoint } from "../../../db/schema";
import { requireWorkspace } from "../../../lib/guard";
import { getPermissionMatrix, listConnectedAgents } from "../../../lib/permissions";

const KIND_TEXT: Record<string, string> = {
  read: "Looks things up and changes nothing",
  create: "Adds something new",
  edit: "Changes or runs something that exists, deploys included",
  delete: "Removes something. Off by default",
};

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";
  const params = await searchParams;

  const [matrix, agents, kinds] = await Promise.all([
    getPermissionMatrix(ws.workspaceId),
    listConnectedAgents(ws.workspaceId),
    db
      .select({ kind: apiEndpoint.kind, names: sql<string[]>`array_agg(${apiEndpoint.name} order by ${apiEndpoint.name})` })
      .from(apiEndpoint)
      .where(isNull(apiEndpoint.removedAt))
      .groupBy(apiEndpoint.kind),
  ]);

  const selected = matrix.instances.find((i) => i.id === params.instance) ?? matrix.instances[0];

  const header = (
    <>
      <p className="zq-kicker">Permissions</p>
      <h1 className="zq-h">
        Decide what each agent can do<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Set a default for each Dokploy instance, then override it for any agent. Zeqqat checks this on every call, so a
        change takes effect on the agent&rsquo;s next call.
      </p>
    </>
  );

  if (!selected) {
    return (
      <div>
        {header}
        <div className="zq-block">
          <p className="zq-empty">Connect a Dokploy instance first. Its permissions show up here.</p>
        </div>
      </div>
    );
  }

  const rows: MatrixRow[] = [
    {
      key: `${selected.id}-default`,
      instanceId: selected.id,
      oauthClientId: null,
      label: "Workspace default",
      hint: "New agents start here",
      perm: matrix.cell(selected.id, null).perm,
      own: true,
    },
    ...agents.map((a) => {
      const c = matrix.cell(selected.id, a.oauthClientId);
      return {
        key: `${selected.id}-${a.oauthClientId}`,
        instanceId: selected.id,
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
      {header}
      {matrix.instances.length > 1 && (
        <div className="zq-filters">
          <span className="zq-label" style={{ margin: 0 }}>
            Instance
          </span>
          <nav className="zq-seg" aria-label="Instance">
            {matrix.instances.map((i) => (
              <a key={i.id} href={`/app/permissions?instance=${i.id}`} className={i.id === selected.id ? "is-on" : undefined} aria-current={i.id === selected.id ? "page" : undefined}>
                {i.alias}
              </a>
            ))}
          </nav>
        </div>
      )}
      <div className="zq-block" style={{ marginTop: 16 }}>
        <PermMatrix key={selected.id} rows={rows} firstCol={`On ${selected.alias}`} editable={isOwner} />
        {agents.length === 0 && <p className="zq-note">Agents appear here once they connect.</p>}
      </div>

      <section className="zq-block">
        <div className="zq-panel-box">
          <h2 className="zq-block-t">What each kind covers</h2>
          <dl className="zq-kv" style={{ marginTop: 12 }}>
            {(["read", "create", "edit", "delete"] as const).map((k) => {
              const row = kinds.find((r) => r.kind === k);
              return (
                <div key={k} style={{ display: "contents" }}>
                  <dt style={{ textTransform: "capitalize" }}>{k}</dt>
                  <dd>
                    {KIND_TEXT[k]}
                    <span style={{ display: "block", color: "var(--faint)", marginTop: 4 }}>
                      {row ? row.names.join(", ") : "No Dokploy tools of this kind yet"}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>
    </div>
  );
}
