import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { apiEndpoint, instance, integration, organization } from "../../../db/schema";
import { requireWorkspace } from "../../../lib/guard";
import { toCanonical, toolPagePath } from "../../../lib/tool-names";

const KINDS = ["read", "create", "edit", "delete"] as const;
const PAGE = 100;

// Every operation the agents in this workspace can find through search,
// for the instances connected here. The catalog is large on purpose; this
// page is for finding one, not scrolling all of them.
export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const kind = typeof params.kind === "string" && (KINDS as readonly string[]).includes(params.kind) ? params.kind : "";

  const integrations = await db
    .selectDistinct({ id: integration.id, name: integration.name })
    .from(integration)
    .innerJoin(instance, eq(instance.integrationId, integration.id))
    .where(eq(instance.workspaceId, ws.workspaceId));
  const ids = integrations.map((i) => i.id);

  const filters = [
    inArray(apiEndpoint.integrationId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    isNull(apiEndpoint.removedAt),
    q
      ? or(
          ilike(apiEndpoint.action, `%${q}%`),
          ilike(apiEndpoint.name, `%${q}%`),
          ilike(apiEndpoint.summary, `%${q}%`),
          ilike(apiEndpoint.path, `%${q}%`),
        )
      : undefined,
    kind ? eq(apiEndpoint.kind, kind) : undefined,
  ].filter(Boolean) as ReturnType<typeof eq>[];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: apiEndpoint.id,
        operationId: apiEndpoint.name,
        action: apiEndpoint.action,
        integrationSlug: integration.slug,
        orgSlug: organization.slug,
        summary: apiEndpoint.summary,
        method: apiEndpoint.method,
        path: apiEndpoint.path,
        kind: apiEndpoint.kind,
        integrationName: integration.name,
      })
      .from(apiEndpoint)
      .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
      .innerJoin(organization, eq(organization.id, integration.organizationId))
      .where(and(...filters))
      .orderBy(asc(apiEndpoint.action))
      .limit(PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(apiEndpoint).where(and(...filters)),
  ]);

  return (
    <div>
      <p className="zq-kicker">Tools</p>
      <h1 className="zq-h">
        What agents can find<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Every tool of the integrations connected to this workspace, named <code>@org/target.type.action</code>. Agents find them
        with zeqqat_search and run them with zeqqat_run by operationId on an instance; whether a run is allowed is decided by
        the connection (or the policy attached to the instance) and the person&rsquo;s role.
      </p>

      <form className="zq-search" role="search">
        <input className="zq-input" name="q" defaultValue={q} placeholder="Search, e.g. deploy, logs, domain" aria-label="Search tools" />
        <select className="zq-select" name="kind" defaultValue={kind} aria-label="Kind" style={{ width: "auto" }}>
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="submit" className="zq-action">
          Search
        </button>
      </form>

      <div className="zq-block">
        {ids.length === 0 ? (
          <p className="zq-empty">
            No instances connected yet. <a className="zq-textlink" href="/app/integrations">Add one</a> and its tools appear here.
          </p>
        ) : rows.length === 0 ? (
          <p className="zq-empty">No tools match &ldquo;{q}&rdquo;.</p>
        ) : (
          <>
            <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
              {total > rows.length ? `Showing ${rows.length} of ${total}. Narrow the search to see the rest.` : `${total} tools`}
              {integrations.length ? ` · ${integrations.map((i) => i.name).join(", ")}` : ""}
            </p>
            <div className="zq-list">
              {rows.map((r) => {
                const parts = { org: r.orgSlug, target: r.integrationSlug, type: "http" as const, action: r.action };
                return (
                <div className="zq-item" key={r.id}>
                  <a className="zq-item-main" href={toolPagePath(parts)}>
                    <div className="zq-item-t">
                      <code>{toCanonical(parts)}</code>
                    </div>
                    <div className="zq-item-s">
                      {r.operationId} · {r.method} {r.path}
                      {r.summary ? ` · ${r.summary}` : ""}
                    </div>
                  </a>
                  <div className="zq-item-r">
                    <span className={`zq-kind k-${r.kind}`}>{r.kind}</span>
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
