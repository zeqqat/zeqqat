import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CrumbLast } from "./AppShell";
import { DokployMark } from "./Marks";
import { colorOf } from "../lib/avatar-color";
import { ManageRow } from "./McpUrlPage";
import { PolicyTools } from "./PolicyClient";
import { PolicyCardBody, PolicyMapRows, PolicyTabs } from "./PolicyViews";
import { db } from "../db";
import { integration, organization, workspace } from "../db/schema";
import { deletePolicyAction, savePolicyAllowAction, updatePolicyMetaAction } from "../lib/actions/policies";
import { accountHref, hrefIn, requireAccount, requireWorkspace } from "../lib/guard";
import { accountScope } from "../lib/integration-scope";
import { getPolicy, policyWorkspaceIds } from "../lib/policies";
import { defaultIntegrationId, personOf, policyCards, policyMap, policyTools } from "../lib/policy-pages";

const ERRORS: Record<string, string> = {
  name: "Name it with letters and numbers, for example read_plus_deploy.",
  taken: "You already have a policy with that name for this integration.",
  in_use: "This policy is used by an MCP URL. Pick another policy there first.",
};

// One policy's page. It belongs to the account, so it opens at
// /<username>/policies/<id>; opened from a workspace's Policies list it stays
// in that workspace (/<username>/<workspace>/policies/<id>) and shows only
// how that workspace's MCP URLs use it. Edits work the same from both.
export async function PolicyPageView({
  id,
  query,
  scope,
}: {
  id: string;
  query: Record<string, string | string[] | undefined>;
  scope: "account" | "workspace";
}) {
  // The workspace's page needs the workspace; the account's works without one.
  const wctx = scope === "workspace" ? await requireWorkspace() : null;
  const { user, acct: ws } = wctx ? { user: wctx.user, acct: wctx.ws } : await requireAccount();
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : "");
  const workspaceIds = wctx ? [wctx.ws.workspaceId] : (await accountScope(user.id, ws)).workspaceIds;
  const listBase = wctx ? hrefIn(wctx.ws, "/policies") : accountHref(ws, "/policies");
  const back = <input type="hidden" name="policies_base" value={listBase} />;
  const cards = await policyCards(ws.organizationId, workspaceIds, false);
  const card = cards.find((c) => c.id === id);
  if (!card) notFound();

  // The default policy: what every MCP URL starts with. Nobody edits it.
  if (id === "default") {
    const tab = one("tab") === "tools" ? "tools" : "map";
    const integrationId = await defaultIntegrationId(workspaceIds, ws.organizationId);
    const [rows, tools] = await Promise.all([
      policyMap(workspaceIds, null, null),
      integrationId ? policyTools(integrationId, [], null) : Promise.resolve([]),
    ]);
    const allow = tools.filter((t) => t.kind !== "delete").map((t) => t.name);
    return (
      <div className="zq-in-card zq-pl-page">
        <CrumbLast text="Default policy" />
        <div className="zq-pl-row is-head">
          <PolicyCardBody card={card} />
        </div>
        <PolicyTabs tabs={[["map", "Map"], ["tools", "MCP tools"]]} tab={tab} />
        {tab === "map" && <PolicyMapRows rows={rows} account={ws.organizationSlug} />}
        {tab === "tools" && <PolicyTools tools={tools} allow={allow} editable={false} start="allowed" version={null} urls={card.urls} />}
      </div>
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getPolicy(id);
  if (!found || found.row.organizationId !== ws.organizationId) notFound();
  const { row, summary } = found;
  const canEdit = ws.orgRole === "owner";
  const [tools, rows, createdBy, allWorkspaces, inWorkspaces, [integ]] = await Promise.all([
    policyTools(row.integrationId, row.allow ?? [], row.updatedAt),
    policyMap(workspaceIds, row.id, summary.canonical),
    personOf(row.createdByUserId),
    db.select({ id: workspace.id, name: workspace.name }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)),
    policyWorkspaceIds(row.id),
    db
      .select({ ns: organization.slug, slug: integration.slug })
      .from(integration)
      .innerJoin(organization, eq(organization.id, integration.organizationId))
      .where(eq(integration.id, row.integrationId))
      .limit(1),
  ]);
  const newCount = tools.filter((t) => t.isNew).length;
  const tabParam = one("tab");
  const tab = tabParam === "tools" || tabParam === "manage" ? tabParam : "map";
  const error = ERRORS[one("error")];
  const created = row.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const wsNames = allWorkspaces.filter((w) => inWorkspaces.includes(w.id)).map((w) => w.name);

  return (
    <div className="zq-in-card zq-pl-page">
      <CrumbLast text={row.name} />
      <div className="zq-pl-row is-head">
        <PolicyCardBody card={card} bio={row.description} />
      </div>
      <PolicyTabs
        tabs={[
          ["map", "Map"],
          ["tools", "MCP tools"],
          ["manage", "Manage"],
        ]}
        tab={tab}
        dot={newCount > 0 && canEdit ? "manage" : undefined}
      />
      {error && <p className="zq-form-err zq-pl-err">{error}</p>}

      {tab === "map" && <PolicyMapRows rows={rows} account={ws.organizationSlug} />}

      {tab === "tools" && (
        <form action={savePolicyAllowAction} className="zq-pl-form">
          <input type="hidden" name="policy_id" value={row.id} />
                {back}
          <PolicyTools
            key={row.version}
            tools={tools}
            allow={row.allow ?? []}
            editable={canEdit}
            start={one("show") === "new" && newCount > 0 ? "new" : "allowed"}
            version={row.version}
            urls={card.urls}
            emptyNote="Nothing is allowed yet."
          />
        </form>
      )}

      {tab === "manage" && (
        <div>
          {newCount > 0 && canEdit && (
            <div className="zq-mu-mrow zq-pl-attn">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>
                    <span className="zq-pl-dot" aria-hidden="true" />
                    {newCount} new MCP tool{newCount === 1 ? "" : "s"}
                  </b>
                  <small>
                    Added after this policy was last saved. {newCount === 1 ? "It isn’t" : "They aren’t"} on its list, so{" "}
                    {newCount === 1 ? "it’s" : "they’re"} denied.
                  </small>
                </span>
                <a className="zq-action zq-action-sm zq-mu-mbtn" href="?tab=tools&show=new">
                  Review
                </a>
              </div>
            </div>
          )}
          {createdBy && (
            <div className="zq-mu-mrow">
              <div className="zq-ip-added">
                <span className="zq-ip-added-l">Created by</span>
                <span className="zq-ip-addedby">
                  <span className="zq-mu-av zq-ip-added-av" style={createdBy.image ? undefined : { background: colorOf(createdBy.slug ?? createdBy.name ?? "") }} aria-hidden="true">
                    {createdBy.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar from the sign-in provider
                      <img src={createdBy.image} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      (createdBy.name || createdBy.slug || "?").trim().charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="zq-ip-addedby-t">
                    <span className="zq-mu-pn">
                      <b>{createdBy.name || createdBy.slug}</b> {createdBy.slug && <span>@{createdBy.slug}</span>}
                    </span>
                    <span className="zq-ip-added-d">{created}</span>
                  </span>
                </span>
              </div>
            </div>
          )}
          {canEdit ? (
            <>
              <ManageRow title="Name" value={<code className="zq-pl-canon">{summary.canonical}</code>} button="Rename" submit="Rename" formId="pm-name">
                <input className="zq-input" form="pm-name" name="name" defaultValue={row.name} required maxLength={64} aria-label="Policy name" />
              </ManageRow>
              <ManageRow title="What agents read" value={row.description || "Nothing yet"} button="Edit" submit="Save" formId="pm-desc">
                <textarea className="zq-input" form="pm-desc" name="description" defaultValue={row.description} maxLength={280} rows={3} aria-label="What agents read" />
              </ManageRow>
              <form action={updatePolicyMetaAction} className="zq-mu-mrow">
                <input type="hidden" name="policy_id" value={row.id} />
                {back}
                <input type="hidden" name="visibility" value={row.visibility === "public" ? "private" : "public"} />
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>Public</b>
                    <small>{row.visibility === "public" ? `Listed on @${ws.organizationSlug}, anyone can copy it` : "Only @" + ws.organizationSlug + " sees it"}</small>
                  </span>
                  <button type="submit" className="zq-toggle" aria-pressed={row.visibility === "public"} aria-label="Public" />
                </div>
              </form>
              {allWorkspaces.length > 1 && (
                <>
                  <ManageRow title="Workspaces" value={wsNames.join(", ") || "None"} button="Change" submit="Save" formId="pm-ws">
                    <div className="zq-pl-wslist">
                      {allWorkspaces.map((w) => (
                        <label key={w.id}>
                          <input type="checkbox" form="pm-ws" name="workspace" value={w.id} defaultChecked={inWorkspaces.includes(w.id)} /> {w.name}
                        </label>
                      ))}
                    </div>
                  </ManageRow>
                </>
              )}
              <div className="zq-mu-mrow">
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>Integration</b>
                    <small className="zq-pl-integ">
                      <DokployMark size={13} /> {integ ? `@${integ.ns}/${integ.slug}` : found.integrationTitle}
                    </small>
                  </span>
                </div>
              </div>
              {card.urls > 0 ? (
                <div className="zq-mu-mrow">
                  <div className="zq-mu-mrow-h">
                    <span className="zq-mu-mrow-t">
                      <b>Delete</b>
                      <small>
                        Used on {card.urls} MCP URL{card.urls === 1 ? "" : "s"}. Pick another policy there first.
                      </small>
                    </span>
                    <button type="button" className="zq-action zq-action-sm zq-mu-mbtn zq-action-danger" disabled>
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <ManageRow title="Delete" value="Not used by any MCP URL" button="Delete" submit="Delete for good" formId="pm-del" danger>
                  <p className="zq-pl-q">Copies others made stay theirs.</p>
                </ManageRow>
              )}
              {/* The forms the rows above submit; kept out of the rows so their borders join up. */}
              <form id="pm-name" action={updatePolicyMetaAction}>
                <input type="hidden" name="policy_id" value={row.id} />
                {back}
              </form>
              <form id="pm-desc" action={updatePolicyMetaAction}>
                <input type="hidden" name="policy_id" value={row.id} />
                {back}
              </form>
              <form id="pm-ws" action={updatePolicyMetaAction}>
                <input type="hidden" name="policy_id" value={row.id} />
                {back}
                <input type="hidden" name="workspaces" value="1" />
              </form>
              <form id="pm-del" action={deletePolicyAction}>
                <input type="hidden" name="policy_id" value={row.id} />
                {back}
              </form>
            </>
          ) : (
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>Name</b>
                  <small>
                    <code className="zq-pl-canon">{summary.canonical}</code>
                  </small>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
