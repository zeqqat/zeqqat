import { notFound } from "next/navigation";
import { CrumbLast } from "../../../../components/AppShell";
import { IntegrationMark } from "../../../../components/Marks";
import { AgentChips, InstanceRows, ManageRow, type InstanceRowData } from "../../../../components/McpUrlPage";
import { McpUrlCard, type UrlItem } from "../../../../components/McpUrls";
import { db } from "../../../../db";
import { instance, integration } from "../../../../db/schema";
import {
  deleteConnectionAction,
  replaceConnectionAction,
  reviveConnectionAction,
  savePolicyAction,
  setAuthModeAction,
  sunsetConnectionAction,
  updateDescriptionAction,
} from "../../../../lib/actions/connections";
import { connectionTokenHolders, formatCutoff, getConnection, getConnectionById, getConnectionPolicy, sunsetState } from "../../../../lib/connections";
import { requireWorkspace } from "../../../../lib/guard";
import { connectedPeople, cutoffLabel, policyCounts, toolTotals, urlCounts, usageByUrl, type ConnectedPerson } from "../../../../lib/mcp-urls";
import { pickablePolicies, type PolicySummary } from "../../../../lib/policies";
import { eq, inArray } from "drizzle-orm";

type Tab = "instances" | "connected" | "manage";

const AGENT_LOGO: Record<string, string | null> = {
  claude: "/logos/claude.svg",
  cursor: "/logos/cursor.svg",
  chatgpt: "/logos/chatgpt.svg",
  other: null,
};

// Initials on a colour picked from the person's id, the same every time.
const AV_COLOURS = ["#2e6fe0", "#1e9e82", "#b57a11", "#8a4fd1", "#c9423a", "#3b8bb5", "#a8558a", "#5a6b78"];
function Avatar({ p, className = "zq-mu-av" }: { p: Pick<ConnectedPerson, "userId" | "name" | "image">; className?: string }) {
  if (p.image) {
    // eslint-disable-next-line @next/next/no-img-element -- account photo, tiny
    return <img className={className} src={p.image} alt="" title={p.name} />;
  }
  const n = [...p.userId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={className} style={{ background: AV_COLOURS[n % AV_COLOURS.length] }} title={p.name} aria-hidden="true">
      {(p.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function since(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Defaults for the date inputs. A server component renders once per
// request, so reading the clock here is fine.
function dateDefaults() {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  return { today: now.toISOString().slice(0, 10), inAWeek: week.toISOString().slice(0, 10), now: now.getTime() };
}

function Ok({ children }: { children: React.ReactNode }) {
  return (
    <div className="zq-ok-box" role="status" style={{ marginBottom: 14 }}>
      <span className="ic" aria-hidden="true">
        ✓
      </span>
      <span>{children}</span>
    </div>
  );
}

export default async function McpUrlPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;
  const conn = await getConnection(ws.workspaceId, id);
  if (!conn) notFound();
  const isAdmin = ws.wsRole === "admin";
  const isPublic = conn.authMode === "public";
  const state = sunsetState(conn);
  const asked = typeof query.tab === "string" ? query.tab : "";
  const tab: Tab = asked === "connected" || (asked === "manage" && isAdmin) ? asked : "instances";
  const href = (t: Tab) => `/app/mcp-urls/${conn.id}${t === "instances" ? "" : `?tab=${t}`}`;
  const prefix = conn.url.slice(0, conn.url.length - `${conn.name}/${conn.shortId}`.length);

  const [replacedBy, replaces, holders, people, rows, usage, urlCount] = await Promise.all([
    conn.replacedByConnectionId ? getConnectionById(conn.replacedByConnectionId) : null,
    typeof query.replaced === "string" ? getConnection(ws.workspaceId, query.replaced) : null,
    state === "warning" && isAdmin ? connectionTokenHolders(conn.id) : [],
    isPublic ? Promise.resolve([] as ConnectedPerson[]) : connectedPeople(conn.id),
    getConnectionPolicy(conn.id, ws.workspaceId),
    usageByUrl(ws.workspaceId, [conn.id]),
    urlCounts([conn.id]),
  ]);

  // Instances, grouped by app, with tool counts per kind: what exists, and
  // what each policy this workspace can pick would allow.
  const instanceIds = rows.map((r) => r.instanceId);
  const slugs = [...new Set(rows.map((r) => r.integrationSlug))];
  const [totals, pickable, logos] = await Promise.all([
    toolTotals(instanceIds),
    Promise.all(slugs.map(async (slug) => [slug, await pickablePolicies(ws.workspaceId, slug)] as const)).then((e) => new Map<string, PolicySummary[]>(e)),
    instanceIds.length
      ? db.select({ id: instance.id, logo: integration.logoUrl }).from(instance).innerJoin(integration, eq(integration.id, instance.integrationId)).where(inArray(instance.id, instanceIds))
      : Promise.resolve([] as { id: string; logo: string | null }[]),
  ]);
  const counts = await policyCounts(rows.flatMap((r) => (pickable.get(r.integrationSlug) ?? []).map((p) => ({ policyId: p.id, instanceId: r.instanceId }))));
  const zero = { read: 0, create: 0, edit: 0, delete: 0 };
  const groups = slugs.map((slug) => {
    const mine = rows.filter((r) => r.integrationSlug === slug);
    return {
      slug,
      name: mine[0].integrationName,
      logo: logos.find((l) => l.id === mine[0].instanceId)?.logo ?? null,
      rows: mine.map(
        (r): InstanceRowData => ({
          instanceId: r.instanceId,
          alias: r.alias,
          enabled: r.enabled,
          perm: r.perm,
          policyId: r.policyId,
          totals: totals.get(r.instanceId) ?? zero,
          policies: (pickable.get(slug) ?? []).map((p) => ({ id: p.id, name: p.name, counts: counts.get(`${p.id}:${r.instanceId}`) ?? zero })),
        }),
      ),
    };
  });

  const { today, inAWeek, now } = dateDefaults();
  const item: UrlItem = {
    id: conn.id,
    url: conn.url,
    prefix,
    name: conn.name,
    shortId: conn.shortId,
    isPublic,
    state,
    cutoff: conn.sunsetAt ? cutoffLabel(conn.sunsetAt) : null,
    people: urlCount.people.get(conn.id) ?? 0,
    instances: urlCount.instances.get(conn.id) ?? 0,
    usage: usage.get(conn.id) ?? { days: Array(30).fill(0), hours: Array(24).fill(0) },
  };
  const err = typeof query.error === "string" ? query.error : "";

  return (
    <div className="zq-mu-page">
      <CrumbLast text={`${conn.name}/${conn.shortId}`} />
      {query.created && <Ok>MCP URL created. Copy it into your agent.</Ok>}
      {query.saved && <Ok>Saved. It applies from the next call.</Ok>}
      {query.sunset && <Ok>Turn-off date set. Agents are told the date on every call from now on.</Ok>}
      {replaces && (
        <Ok>
          This replaces <a className="zq-textlink" href={`/app/mcp-urls/${replaces.id}`}>{replaces.url}</a>, with the same access.{" "}
          {replaces.sunsetAt
            ? `That one keeps working until ${cutoffLabel(replaces.sunsetAt)} and tells agents this URL until then.`
            : "That one keeps working until you turn it off, and tells agents this URL in the meantime."}
        </Ok>
      )}

      <McpUrlCard item={item} description={conn.description} />

      <div className="zq-mu-detail">
        <nav className="zq-mu-tabs" aria-label="MCP URL">
          {(
            [
              ["instances", "Instances"],
              ["connected", "Connected"],
              ...(isAdmin ? ([["manage", "Manage"]] as const) : []),
            ] as const
          ).map(([t, label]) => (
            <a key={t} href={href(t)} className={`zq-mu-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>

        {tab === "instances" && (
          <>
            {ws.role === "owner" && (
              <a className="zq-mu-addrow" href="/app/instances?add=1">
                <span aria-hidden="true">+</span>Add a Dokploy instance
              </a>
            )}
            {groups.length === 0 ? (
              <p className="zq-empty zq-mu-pad">This workspace has no Dokploy instances yet.</p>
            ) : (
              <form action={savePolicyAction}>
                <input type="hidden" name="connection_id" value={conn.id} />
                <div className={`zq-mu-apps${ws.role === "owner" ? "" : " is-first"}`}>
                  {groups.map((g) => (
                    <div className="zq-mu-appbox" key={g.slug}>
                      <div className="zq-mu-appbox-h">
                        <span className="zq-mu-logo">
                          <IntegrationMark slug={g.slug} name={g.name} logo={g.logo} size={13} />
                        </span>
                        {g.name}
                      </div>
                      <InstanceRows rows={g.rows} admin={isAdmin} isPublic={isPublic} />
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <div className="zq-mu-save">
                    <button type="submit" className="zq-action zq-action-primary">
                      Save
                    </button>
                  </div>
                )}
              </form>
            )}
          </>
        )}

        {tab === "connected" &&
          (isPublic ? (
            <p className="zq-empty zq-mu-pad">Public: anyone with the URL can read, with no sign-in.</p>
          ) : people.length === 0 ? (
            <p className="zq-empty zq-mu-pad">No one has connected to this URL yet.</p>
          ) : (
            <div className="zq-mu-panel">
              {people.map((p) => (
                <div className="zq-mu-person" key={p.userId}>
                  <Avatar p={p} />
                  <div className="zq-mu-pt">
                    <div className="zq-mu-pl">
                      <span className="zq-mu-pn">
                        <b>{p.name}</b> {p.username && <span>@{p.username}</span>}
                      </span>
                      <span className="zq-mu-pd">connected {since(p.since)}</span>
                    </div>
                    <div className="zq-mu-pl">
                      <span className="zq-mu-pc">
                        {p.calls.toLocaleString("en-US")} {p.calls === 1 ? "call" : "calls"}
                      </span>
                      <AgentChips agents={p.agents.map((a) => ({ ...a, logo: AGENT_LOGO[a.brand] }))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "manage" && isAdmin && (
          <div className="zq-mu-panel">
            <ManageRow
              key={`row1-${now}`}
              title="Description"
              value={conn.description || <span className="zq-mu-none">None</span>}
              expandable={!!conn.description}
              button="Edit"
              submit="Save"
              formId="mu-desc"
            >
              <form action={updateDescriptionAction} id="mu-desc">
                <input type="hidden" name="connection_id" value={conn.id} />
                <textarea
                  className="zq-input"
                  name="description"
                  rows={3}
                  maxLength={140}
                  defaultValue={conn.description ?? ""}
                  placeholder="The kind of tools this URL connects to"
                  aria-label="Description"
                />
              </form>
            </ManageRow>

            {state !== "cutoff" && (
              <div className="zq-mu-mrow">
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>Public</b>
                    <small>Anyone with the URL can read, with no sign-in</small>
                  </span>
                  <form action={setAuthModeAction}>
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <input type="hidden" name="auth_mode" value={isPublic ? "members" : "public"} />
                    <button type="submit" className="zq-toggle" aria-pressed={isPublic} aria-label="Public" />
                  </form>
                </div>
              </div>
            )}

            {state !== "cutoff" && (
              <ManageRow
              key={`row2-${now}`}
                title="Turn-off date"
                value={
                  conn.sunsetAt ? (
                    <>
                      {cutoffLabel(conn.sunsetAt)}
                      {holders.length > 0 && <> · tell {holders.map((h) => h.email).join(", ")}</>}
                    </>
                  ) : (
                    <span className="zq-mu-none">None</span>
                  )
                }
                button={conn.sunsetAt ? "Change" : "Set date"}
                submit="Save"
                formId="mu-sunset"
                extra={conn.sunsetAt ? [{ label: "Remove date", formId: "mu-revive" }] : []}
                open={err === "cutoff"}
              >
                <form action={sunsetConnectionAction} id="mu-sunset" style={{ display: "grid", gap: 8 }}>
                  <input type="hidden" name="connection_id" value={conn.id} />
                  <input
                    className="zq-input"
                    type="date"
                    name="cutoff"
                    min={today}
                    defaultValue={conn.sunsetAt ? formatCutoff(conn.sunsetAt) : inAWeek}
                    aria-label="Turn-off date"
                    required
                  />
                  <input className="zq-input" name="message" defaultValue={conn.sunsetMessage ?? ""} placeholder="Note for agents (optional)" maxLength={400} />
                  {err === "cutoff" && <p className="zq-form-err">Pick a date.</p>}
                </form>
                {conn.sunsetAt && (
                  <form action={reviveConnectionAction} id="mu-revive">
                    <input type="hidden" name="connection_id" value={conn.id} />
                  </form>
                )}
              </ManageRow>
            )}

            {state !== "cutoff" && (
              <ManageRow
              key={`row3-${now}`}
                title="Replace"
                value={replacedBy ? <>Replaced by {replacedBy.url}</> : "A new URL with the same access. This one tells agents where to go"}
                button="Replace"
                submit="Make the new URL"
                formId="mu-replace"
                open={err === "name"}
              >
                <form action={replaceConnectionAction} id="mu-replace" style={{ display: "grid", gap: 8 }}>
                  <input type="hidden" name="connection_id" value={conn.id} />
                  <input className="zq-input" name="name" placeholder={`Name (default ${conn.name})`} autoComplete="off" aria-label="Name" />
                  <label className="zq-label" htmlFor="mu-replace-cutoff" style={{ margin: 0 }}>
                    Turn this one off on
                  </label>
                  <input className="zq-input" id="mu-replace-cutoff" type="date" name="cutoff" min={today} defaultValue={inAWeek} />
                  <input className="zq-input" name="message" placeholder="Note for agents (optional)" maxLength={400} aria-label="Note for agents" />
                  {err === "name" && <p className="zq-form-err">Use letters and numbers for the name.</p>}
                </form>
              </ManageRow>
            )}

            <ManageRow
              key={`row4-${now}`}
              title="Delete"
              value="Stops answering at once and disconnects everyone"
              button="Delete"
              submit="Delete this URL"
              formId="mu-delete"
              danger
              open={err === "confirm"}
            >
              <form action={deleteConnectionAction} id="mu-delete">
                <input type="hidden" name="connection_id" value={conn.id} />
                <input className="zq-input" name="confirm" placeholder="Type delete to confirm" autoComplete="off" aria-label="Type delete to confirm" />
                {err === "confirm" && <p className="zq-form-err">Type delete to confirm.</p>}
              </form>
            </ManageRow>
          </div>
        )}
      </div>
    </div>
  );
}
