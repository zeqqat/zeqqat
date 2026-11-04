import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PolicyForm } from "../../../../components/PolicyForm";
import { db } from "../../../../db";
import { workspace } from "../../../../db/schema";
import { deletePolicyAction, restoreRevisionAction, updateCopyAction } from "../../../../lib/actions/policies";
import { requireWorkspace } from "../../../../lib/guard";
import {
  getPolicy,
  handleOf,
  integrationTools,
  policyRevisions,
  policyWarnings,
  policyWorkspaceIds,
  sourceUpdate,
} from "../../../../lib/policies";
import { policyPagePath } from "../../../../lib/tool-names";

const ERRORS: Record<string, string> = {
  name: "Name it with letters and numbers, for example read_plus_deploy.",
  taken: "This namespace already has a policy with that name for this integration.",
  in_use: "This policy is attached to a connection. Pick another policy there first.",
};

function Ok({ text }: { text: string }) {
  return (
    <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
      <span className="ic" aria-hidden="true">
        ✓
      </span>
      <span>{text}</span>
    </div>
  );
}

export default async function PolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;
  const found = await getPolicy(id);
  if (!found || found.row.organizationId !== ws.organizationId) notFound();
  const { row, summary } = found;
  const canEdit = ws.orgRole === "owner";

  const [tools, workspaces, workspaceIds, warnings, revisions, update, createdBy, updatedBy] = await Promise.all([
    integrationTools(row.integrationId),
    db.select({ id: workspace.id, name: workspace.name }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)),
    policyWorkspaceIds(row.id),
    policyWarnings({ allow: row.allow ?? [], specRelease: row.specRelease }, row.integrationId),
    policyRevisions(row.id),
    sourceUpdate(row),
    handleOf(row.createdByUserId),
    handleOf(row.updatedByUserId),
  ]);
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const hasWarnings = warnings.missing.length > 0 || warnings.notListed > 0 || warnings.specChanged;

  return (
    <div>
      <p className="zq-kicker">
        <a className="zq-textlink" href="/app/policies">
          Policies
        </a>
      </p>
      <h1 className="zq-h">
        {row.name}
        <span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        <code>{summary.canonical}</code> · v{row.version}
        {row.specRelease ? ` · written for ${found.integrationTitle} ${row.specRelease}` : ""}
        {createdBy ? ` · by ${createdBy}` : ""}
        {updatedBy && updatedBy !== createdBy ? `, last edited by ${updatedBy}` : ""}
      </p>
      {error && <p className="zq-form-err">{error}</p>}
      {query.saved && <Ok text={`Saved as v${row.version}. It applies from the next call.`} />}
      {query.copied && <Ok text="Copied into your namespace. It's yours now: edit it freely." />}

      {row.copiedFromName && (
        <section className="zq-block">
          <p className="zq-note" style={{ marginTop: 0 }}>
            Copied from <code>{row.copiedFromName}</code> v{row.copiedFromVersion}. Changes to the original never change this copy.
          </p>
          {update && (
            <div className="zq-warn-box" role="status">
              <span>
                Update available: the original is at v{update.row.version}.{" "}
                {canEdit && (
                  <form action={updateCopyAction} style={{ display: "inline" }}>
                    <input type="hidden" name="policy_id" value={row.id} />
                    <button type="submit" className="zq-action">
                      Update this copy
                    </button>
                  </form>
                )}
              </span>
            </div>
          )}
        </section>
      )}

      {hasWarnings && (
        <div className="zq-warn-box" role="status" style={{ marginTop: 20 }}>
          <span>
            {warnings.specChanged && `The integration's spec changed since this list was saved (now ${warnings.currentRelease}). `}
            {warnings.missing.length > 0 && `No longer in the spec: ${warnings.missing.join(", ")}. `}
            {warnings.notListed > 0 && `${warnings.notListed} tools aren't on the list, so they're denied. `}
            Review and save to confirm.
          </span>
        </div>
      )}

      <PolicyForm
        policyId={row.id}
        integrationId={row.integrationId}
        integrationLabel={`${found.integrationTitle} (@${summary.namespace}/${summary.integrationSlug})`}
        namespace={summary.namespace}
        integrationSlug={summary.integrationSlug}
        name={row.name}
        description={row.description}
        visibility={row.visibility}
        allow={row.allow ?? []}
        tools={tools}
        workspaces={workspaces}
        workspaceIds={workspaceIds}
        canEdit={canEdit}
      />

      {row.visibility === "public" && (
        <p className="zq-note">
          Public page:{" "}
          <a className="zq-textlink" href={policyPagePath(summary.namespace, summary.integrationSlug, row.name)}>
            {policyPagePath(summary.namespace, summary.integrationSlug, row.name)}
          </a>
        </p>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          History
        </h2>
        <div className="zq-list">
          {revisions.map((r) => (
            <div className="zq-item" key={r.version}>
              <div className="zq-item-main">
                <div className="zq-item-t">
                  v{r.version} · {(r.allow ?? []).length} tools
                </div>
                <div className="zq-item-s">
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  {r.byHandle ? ` · @${r.byHandle}` : r.byName ? ` · ${r.byName}` : ""}
                  {r.description ? ` · ${r.description}` : ""}
                </div>
              </div>
              {canEdit && r.version !== row.version && (
                <div className="zq-item-r">
                  <form action={restoreRevisionAction}>
                    <input type="hidden" name="policy_id" value={row.id} />
                    <input type="hidden" name="version" value={r.version} />
                    <button type="submit" className="zq-action">
                      Restore
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Delete
          </h2>
          <form action={deletePolicyAction}>
            <input type="hidden" name="policy_id" value={row.id} />
            <button type="submit" className="zq-action">
              Delete this policy
            </button>
          </form>
          <p className="zq-note">Copies others made stay theirs. A policy attached to a connection can&rsquo;t be deleted.</p>
        </section>
      )}
    </div>
  );
}
